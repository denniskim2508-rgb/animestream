import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import {
  Play, Pause, RotateCcw as Rewind10, RotateCw as Forward10, SkipBack, SkipForward, List,
  Subtitles, X, Loader2, AlertTriangle, Check, Lock, Server, Settings,
} from 'lucide-react'
import { fetchMediaById } from '../../api/anilist'
import { resolveStream, fetchEpisodeAvailability } from '../../api/anikoto'
import { useAuth } from '../../context/AuthContext'
import { loadAudioPreference, loadVideoSettings } from '../../utils/videoSettings'
import { buildEpisodeList, getNextEpisode, getPrevEpisode, tryArm, cancel as cancelProgression } from '../../utils/episodeProgression'
import { Capacitor } from '@capacitor/core'
import { useFocusable, useTVScope, useTVBackHandler } from '../TVFocusManager'

// ExoPlayerBridge — native embedded player behind the WebView (Android only)
const ExoPlayerBridge = Capacitor.getPlatform() === 'android'
  ? Capacitor.Plugins.ExoPlayerBridge
  : null
import { API_BASE } from '../../api/base'

function encodeHeaders(headers) {
  return btoa(JSON.stringify(headers)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function proxyUrl(url, cdnHeaders) {
  return `${API_BASE}/api/media/proxy?url=${encodeURIComponent(url)}&h=${encodeHeaders(cdnHeaders || {})}`
}

function fmt(t) {
  if (!isFinite(t) || t <= 0) return '0:00'
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = Math.floor(t % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function epLabel(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// Same mapping as the web player: manifest height → label.
function qualityLabel(h) {
  if (h >= 1080) return '1080p'
  if (h >= 720) return '720p'
  if (h >= 480) return '480p'
  if (h >= 360) return '360p'
  return h ? `${h}p` : 'Auto'
}

const IDLE_MS = 3500
const COUNTDOWN_SECONDS = 8
const DRAWER_PAGE_SIZE = 96

// Per-anime provider preference: the last source that actually played this
// title (shared with the web player via the same localStorage record).
function getPreferredProvider(animeId, audioMode, cwProvider) {
  try {
    const map = JSON.parse(localStorage.getItem('providerPrefs') || '{}')
    return map[`${animeId}:${audioMode}`] || cwProvider || null
  } catch { return cwProvider || null }
}
function savePreferredProvider(animeId, audioMode, provider) {
  if (!animeId || !audioMode || !provider) return
  try {
    const map = JSON.parse(localStorage.getItem('providerPrefs') || '{}')
    map[`${animeId}:${audioMode}`] = provider
    localStorage.setItem('providerPrefs', JSON.stringify(map))
  } catch { /* ignore */ }
}
// Backend returns provider entries as either plain ids or { id } objects.
function normalizeProviders(list) {
  if (!Array.isArray(list)) return []
  return list.map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean)
}

export default function TVPlayer() {
  const { animeId, episode } = useParams()
  const epNum = Number(episode)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, addContinueWatching, updateContinueWatchingProgress } = useAuth()

  const paramAudio = searchParams.get('audio')
  const [audio, setAudioState] = useState(paramAudio || loadAudioPreference() || 'sub')

  const isAndroid = Capacitor.getPlatform() === 'android'
  const PLAYER_ID = 'kaisen-player'

  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const loadReqRef = useRef(0)
  const resumeTargetRef = useRef(0)
  const lastSaveRef = useRef(0)
  const introSkippedRef = useRef(false)
  const outroSkippedRef = useRef(false)
  const providerRef = useRef(null)
  const activeProviderRef = useRef(null)
  const providersListRef = useRef([])
  const triedProvidersRef = useRef(new Set())
  const idleTimerRef = useRef(null)

  const [anime, setAnime] = useState(null)
  const [streamData, setStreamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [buffering, setBuffering] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [totalEpisodes, setTotalEpisodes] = useState(0)
  const [providerEps, setProviderEps] = useState([])
  const [hasSub, setHasSub] = useState(true)
  const [hasDub, setHasDub] = useState(false)
  const [subsOn, setSubsOn] = useState(() => {
    try { return loadVideoSettings().subsDefault !== false } catch { return true }
  })
  const [introSkipped, setIntroSkipped] = useState(false)
  const [outroSkipped, setOutroSkipped] = useState(false)
  const [providers, setProviders] = useState([])
  const [activeProvider, setActiveProvider] = useState(null)
  const [showSources, setShowSources] = useState(false)
  // Quality: levels come from the current HLS manifest (never hardcoded);
  // selectedLevel -1 = Auto (hls.js ABR), matching the web player.
  const [showQuality, setShowQuality] = useState(false)
  const [qualityLevels, setQualityLevels] = useState([])
  const [selectedLevel, setSelectedLevel] = useState(-1)

  const [bufferedPos, setBufferedPos] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [showEpisodes, setShowEpisodes] = useState(false)
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [nextVisible, setNextVisible] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [retryKey, setRetryKey] = useState(0)

  // Seek preview while the seekbar is focused: shows the ghost target without
  // touching the real position until a seek is applied.
  const [seekPreview, setSeekPreview] = useState(null)
  const seekBarCommitRef = useRef(null)
  useEffect(() => () => { if (seekBarCommitRef.current) clearTimeout(seekBarCommitRef.current) }, [])

  // Player settings come from the shared appSettings record — the same one the
  // TV Settings page writes, so toggles there take effect here.
  const playerSettings = useMemo(() => loadVideoSettings(), [])
  const autoplayEnabled = playerSettings.autoplay !== false
  const autoSkipIntro = playerSettings.autoSkip !== false

  // The ordered episode universe: provider's REAL numbers when known
  // (normalized + sorted by the shared service), else 1..N fallback.
  const allEpisodes = useMemo(
    () => buildEpisodeList(totalEpisodes, epNum, streamData?.episodeList?.length ? streamData.episodeList : providerEps),
    [totalEpisodes, epNum, streamData, providerEps]
  )
  const nextEp = useMemo(() => getNextEpisode(allEpisodes, epNum), [allEpisodes, epNum])
  const prevEp = useMemo(() => getPrevEpisode(allEpisodes, epNum), [allEpisodes, epNum])

  // ── Load episode ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!animeId || !epNum) return undefined
    const reqId = ++loadReqRef.current
    setLoading(true)
    setError(null)
    setStreamData(null)
    setCurrentTime(0)
    setDuration(0)
    setSeekPreview(null)
    setNextVisible(false)
    setShowSources(false)
    introSkippedRef.current = false
    outroSkippedRef.current = false
    setIntroSkipped(false)
    setOutroSkipped(false)
    triedProvidersRef.current = new Set()
    providersListRef.current = []
    setProviders([])
    setActiveProvider(null)
    activeProviderRef.current = null
    resumeTargetRef.current = 0

    // Resume position for THIS episode only.
    const entry = (user?.continueWatching || []).find(
      (e) => e.animeId === String(animeId) && Number(e.episode) === epNum
    )
    if (entry && entry.currentTime > 5 && entry.duration > 0 && entry.currentTime / entry.duration < 0.95) {
      resumeTargetRef.current = entry.currentTime
    }

    let requestedAudio = audio
    ;(async () => {
      try {
        const [details, avail] = await Promise.all([
          fetchMediaById(animeId),
          fetchEpisodeAvailability(animeId, epNum),
        ])
        if (reqId !== loadReqRef.current) return
        setAnime(details)
        if (Array.isArray(avail?.episodeList) && avail.episodeList.length) setProviderEps(avail.episodeList)
        setTotalEpisodes(Math.max(avail?.totalEpisodes || 0, details?.episodes || 0))
        setHasSub(Boolean(avail?.hasSub))
        setHasDub(Boolean(avail?.hasDub))
        // Gate the requested track: fall back instead of a dead player.
        if (requestedAudio === 'dub' && !avail?.hasDub) requestedAudio = 'sub'
        if (requestedAudio === 'sub' && !avail?.hasSub) requestedAudio = 'sub'
        if (requestedAudio !== audio) {
          setAudioState(requestedAudio)
          setSearchParams({ audio: requestedAudio }, { replace: true })
          return // effect re-runs with the valid mode
        }
        // Preferred source: last one that played this title (localStorage or
        // the continue-watching entry), falling back to the backend default.
        const preferred = getPreferredProvider(animeId, requestedAudio, entry?.provider || null)
        let result
        try {
          result = await resolveStream(
            animeId, epNum, requestedAudio,
            preferred && !triedProvidersRef.current.has(preferred) ? preferred : undefined
          )
        } catch (resolveErr) {
          if (!preferred || triedProvidersRef.current.has(preferred)) throw resolveErr
          triedProvidersRef.current.add(preferred)
          result = await resolveStream(animeId, epNum, requestedAudio)
        }
        if (reqId !== loadReqRef.current) return
        const normalized = normalizeProviders(result.providers)
        if (normalized.length) {
          providersListRef.current = normalized
          setProviders(normalized)
        }
        triedProvidersRef.current.add(result.provider)
        providerRef.current = result.provider || null
        activeProviderRef.current = result.provider || null
        setActiveProvider(result.provider || null)
        setStreamData(result)
        if (Array.isArray(result.episodeList) && result.episodeList.length) setProviderEps(result.episodeList)
        setTotalEpisodes((p) => Math.max(p, result.totalEpisodes || 0))
        setLoading(false)
        addContinueWatching(
          animeId, epNum, details.title, details.coverImage,
          Math.max(avail?.totalEpisodes || 0, result.totalEpisodes || 0),
          requestedAudio, result.provider
        )
      } catch (e) {
        if (reqId !== loadReqRef.current) return
        console.error('[TVPlayer] load failed:', e)
        setError(e?.code === 'DUB_NOT_AVAILABLE'
          ? 'English Dub is not available for this episode.'
          : e?.code === 'SUB_NOT_AVAILABLE'
            ? 'Subtitled stream is not available for this episode.'
            : 'Could not load this episode.')
        setLoading(false)
      }
    })()
    return () => {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animeId, epNum, audio, retryKey])

  // ── Source switching / fallback ────────────────────────────────────────────
  const switchToProvider = useCallback(async (providerId) => {
    const v = videoRef.current
    if (v && Number.isFinite(v.currentTime) && v.currentTime > 1 && Number.isFinite(v.duration) && v.duration > 0) {
      resumeTargetRef.current = v.currentTime // restore position on next attach
    }
    triedProvidersRef.current.add(activeProviderRef.current)
    setLoading(true)
    setError(null)
    setBuffering(false)
    try {
      const result = await resolveStream(animeId, epNum, audio, providerId || undefined)
      const normalized = normalizeProviders(result.providers)
      if (normalized.length) {
        providersListRef.current = normalized
        setProviders(normalized)
      }
      triedProvidersRef.current.add(result.provider)
      providerRef.current = result.provider || null
      activeProviderRef.current = result.provider || null
      setActiveProvider(result.provider || null)
      setStreamData(result)
      setLoading(false)
    } catch {
      setError('Could not switch source.')
      setLoading(false)
    }
  }, [animeId, epNum, audio])

  const attemptNextProvider = useCallback(() => {
    const list = providersListRef.current
    const next = Array.isArray(list) ? list.find((p) => p && !triedProvidersRef.current.has(p)) : null
    if (next) switchToProvider(next)
    else setError('Video playback error. Try again or go back.')
  }, [switchToProvider])

  // ── Black-screen watchdog ──────────────────────────────────────────────────
  // Some provider renditions carry a video track the TV's decoder cannot
  // render: audio plays and time advances while the screen stays black. If
  // playback progresses but zero video frames have decoded after two checks,
  // fail over to the next source automatically (once per attached source).
  const blackScreenRef = useRef({ strikes: 0, lastTime: -1 })
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current
      if (!v || loading || error) return
      const s = blackScreenRef.current
      if (v.paused || v.readyState < 2) { s.lastTime = v.currentTime; return }
      const advanced = s.lastTime >= 0 && v.currentTime > s.lastTime + 1.5
      if (v.videoWidth === 0 && advanced) {
        s.strikes += 1
        if (s.strikes >= 2) {
          s.strikes = 0
          console.warn('[TVPlayer] time advancing but no video frames decoded — failing over to next source')
          attemptNextProvider()
          return
        }
      } else if (v.videoWidth > 0) {
        s.strikes = 0
      }
      s.lastTime = v.currentTime
    }, 3000)
    return () => clearInterval(id)
  }, [loading, error, attemptNextProvider])

  // ── Attach stream ─────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    const url = streamData && streamData.url
    if (!video || !url) return undefined

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    // New source → watchdog gets a fresh budget to judge THIS rendition.
    blackScreenRef.current = { strikes: 0, lastTime: -1 }

    // New source/provider → quality list rebuilds from its manifest, back to Auto.
    setQualityLevels([])
    setSelectedLevel(-1)

    const restore = () => {
      if (resumeTargetRef.current > 5 && isFinite(resumeTargetRef.current)) {
        try { video.currentTime = resumeTargetRef.current } catch { /* ignore */ }
      }
      video.play().catch(() => {})
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr, reqUrl) => {
          let u
          try { u = new URL(reqUrl, window.location.origin) } catch { u = null }
          if (u && u.pathname.endsWith('/api/media/proxy')) return
          xhr.open('GET', proxyUrl(reqUrl, streamData.cdnHeaders), true)
        },
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setQualityLevels((hls.levels || []).map((l, i) => ({ index: i, height: l.height || 0 })))
        setSelectedLevel(-1) // start on Auto
        restore()
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (typeof data.level === 'number') setSelectedLevel(data.level)
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
        } else {
          console.error('[TVPlayer] HLS fatal:', data.type, data.details)
          attemptNextProvider()
        }
      })
      if (Array.isArray(streamData.tracks) && streamData.tracks.length) {
        video.querySelectorAll('track').forEach((t) => t.remove())
        streamData.tracks.forEach((track, i) => {
          try {
            const el = document.createElement('track')
            el.kind = 'subtitles'
            el.label = track.label || track.lang || 'English'
            el.srclang = track.lang || 'en'
            el.src = proxyUrl(track.url, streamData.cdnHeaders)
            el.default = i === 0
            video.appendChild(el)
          } catch { /* ignore bad track */ }
        })
      }
    } else {
      video.src = url
      video.addEventListener('loadedmetadata', restore, { once: true })
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [streamData, attemptNextProvider])

  // Default subtitles on when tracks exist.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamData?.tracks?.length) return
    const apply = () => {
      const tt = video.textTracks
      for (let i = 0; i < tt.length; i++) tt[i].mode = subsOn && i === 0 ? 'showing' : 'hidden'
    }
    const t = setTimeout(apply, 300)
    return () => clearTimeout(t)
  }, [streamData, subsOn])

  // ── Video events ──────────────────────────────────────────────────────────
  const saveProgress = useCallback((force = false) => {
    const video = videoRef.current
    if (!video || !video.duration || !providerRef.current) return
    const now = Date.now()
    if (!force && now - lastSaveRef.current < 15000) return
    lastSaveRef.current = now
    updateContinueWatchingProgress(animeId, epNum, video.currentTime, video.duration, providerRef.current)
  }, [animeId, epNum, updateContinueWatchingProgress])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    const onPlay = () => {
      setPlaying(true)
      savePreferredProvider(animeId, audio, activeProviderRef.current)
    }
    const onPause = () => { setPlaying(false); saveProgress(true) }
    const onWaiting = () => setBuffering(true)
    const onPlayingEvt = () => setBuffering(false)
    const onCanPlay = () => setBuffering(false)
    const onDura = () => setDuration(video.duration)
    const onTime = () => {
      setCurrentTime(video.currentTime)
      // Chapter auto-skip (mirrors web player behavior).
      if (streamData?.chapters?.length) {
        const intro = streamData.chapters.find((c) => /intro/i.test(c.title))
        const outro = streamData.chapters.find((c) => /outro|ed\b|ending/i.test(c.title))
        if (intro && !introSkippedRef.current && video.currentTime >= Math.max(0, intro.start) - 0.5 && video.currentTime < intro.end) {
          if (autoSkipIntro) {
            video.currentTime = intro.end + 0.5
            introSkippedRef.current = true
            setIntroSkipped(true)
            return
          }
        }
        if (intro && !introSkippedRef.current && video.currentTime > intro.end + 0.5) {
          introSkippedRef.current = true
          setIntroSkipped(true)
        }
        if (outro && !outroSkippedRef.current && video.currentTime >= Math.max(0, outro.start) - 0.5 && video.currentTime < outro.end) {
          if (autoSkipIntro) {
            video.currentTime = outro.end + 0.5
            outroSkippedRef.current = true
            setOutroSkipped(true)
            return
          }
        }
        if (outro && !outroSkippedRef.current && video.currentTime > outro.end + 0.5) {
          outroSkippedRef.current = true
          setOutroSkipped(true)
        }
      }
      saveProgress()
    }
    const onEnded = () => {
      saveProgress(true)
      if (nextEp == null) return
      if (autoplayEnabled && tryArm(animeId, epNum)) {
        setCountdown(COUNTDOWN_SECONDS)
        setNextVisible(true)
      }
    }
    const onError = () => attemptNextProvider()

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlayingEvt)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('durationchange', onDura)
    video.addEventListener('loadedmetadata', onDura)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlayingEvt)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('durationchange', onDura)
      video.removeEventListener('loadedmetadata', onDura)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
    }
  }, [streamData, nextEp, autoplayEnabled, autoSkipIntro, animeId, epNum, audio, saveProgress, attemptNextProvider])

  useEffect(() => () => saveProgress(true), [saveProgress]) // save on unmount

  // ── Navigation helpers ────────────────────────────────────────────────────
  const jumpTo = useCallback((target) => {
    cancelProgression(animeId, epNum)
    setNextVisible(false)
    setShowEpisodes(false)
    setShowAudioMenu(false)
    setShowSources(false)
    setShowQuality(false)
    if (target != null) navigate(`/tv/watch/${animeId}/${target}?audio=${audio}`)
  }, [animeId, epNum, audio, navigate])

  const togglePlay = useCallback(() => {
    if (isAndroid && ExoPlayerBridge) {
      if (playing) ExoPlayerBridge.pause()
      else ExoPlayerBridge.play()
      return
    }
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }, [isAndroid, playing])

  const applySeek = useCallback((targetSeconds) => {
    if (isAndroid && ExoPlayerBridge) {
      const clamped = Math.max(0, Math.min((duration || 0) - 0.5, targetSeconds))
      ExoPlayerBridge.seekTo({ position: clamped })
      setCurrentTime(clamped)
      setSeekPreview(null)
      return
    }
    const video = videoRef.current
    if (!video || !isFinite(video.duration) || !video.duration) return
    const clamped = Math.max(0, Math.min(video.duration - 0.5, targetSeconds))
    video.currentTime = clamped
    setCurrentTime(clamped)
    setSeekPreview(null)
  }, [isAndroid, duration])

  const seekBy = useCallback((s) => {
    if (isAndroid) {
      applySeek(currentTime + s)
      return
    }
    const video = videoRef.current
    if (!video || !isFinite(video.duration) || !video.duration) return
    applySeek(video.currentTime + s)
  }, [applySeek, isAndroid, currentTime])

  // Arrow Left/Right with controls hidden seeks directly — standard TV feel.
  // On Android, the native player handles all D-pad/seek input.
  useEffect(() => {
    if (isAndroid) return
    const onKey = (e) => {
      if (controlsVisible || showEpisodes || showAudioMenu || showSources || nextVisible) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); wakeControlsRef.current?.(); seekBy(-10) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); wakeControlsRef.current?.(); seekBy(10) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAndroid, controlsVisible, showEpisodes, showAudioMenu, showSources, nextVisible, seekBy])

  const switchAudio = useCallback((mode) => {
    if (mode === audio) { setShowAudioMenu(false); return }
    cancelProgression(animeId, epNum)
    setShowAudioMenu(false)
    setSearchParams({ audio: mode })
  }, [audio, animeId, epNum, setSearchParams])

  // Quality switch: renditions swap in place via hls.currentLevel — no reload,
  // no position loss (same approach as the web player).
  const applyQuality = useCallback((index) => {
    setSelectedLevel(index)
    const hls = hlsRef.current
    if (hls) hls.currentLevel = index === -1 ? -1 : index
  }, [])

  // ── Manual Skip Intro / Outro ──────────────────────────────────────────────
  // Windows come strictly from provider chapter data — identical to the web
  // player. Without an Intro/Outro chapter there is NO window and the buttons
  // never appear (no time-based heuristics).
  const skipWindows = useMemo(() => {
    const chapters = Array.isArray(streamData?.chapters) ? streamData.chapters : []
    const intro = chapters.find((c) => /intro/i.test(c.title))
    const outro = chapters.find((c) => /outro|ed\b|ending/i.test(c.title))
    return {
      intro: intro ? { start: intro.start, end: intro.end } : null,
      outro: outro ? { start: outro.start, end: outro.end } : null,
    }
  }, [streamData])

  const showSkipIntro = Boolean(
    skipWindows.intro && !introSkipped && !loading && !error &&
    currentTime >= Math.max(0, skipWindows.intro.start - 2) && currentTime <= skipWindows.intro.end + 2
  )
  const showSkipOutro = Boolean(
    skipWindows.outro && !outroSkipped && !loading && !error &&
    currentTime >= Math.max(0, skipWindows.outro.start - 2) && currentTime <= skipWindows.outro.end + 2
  )
  const skipChapter = useCallback((type) => {
    const video = videoRef.current
    const win = type === 'intro' ? skipWindows.intro : skipWindows.outro
    if (!video || !win) return
    video.currentTime = win.end + 0.5
    if (type === 'intro') { introSkippedRef.current = true; setIntroSkipped(true) }
    else { outroSkippedRef.current = true; setOutroSkipped(true) }
  }, [skipWindows])

  // ── Controls visibility / idle hide ───────────────────────────────────────
  // On Android, the native player manages its own controls visibility.
  const wakeControlsRef = useRef(null)
  useEffect(() => {
    if (isAndroid) { wakeControlsRef.current = () => {}; return }
    const wake = () => {
      setControlsVisible(true)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        const v = videoRef.current
        if (v && !v.paused && !showEpisodes && !showAudioMenu && !showSources && !showQuality && !nextVisible) setControlsVisible(false)
      }, IDLE_MS)
    }
    wakeControlsRef.current = wake
    const keys = ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Select']
    const onKey = (e) => { if (keys.includes(e.key)) wake() }
    window.addEventListener('keydown', onKey)
    wake()
    return () => {
      window.removeEventListener('keydown', onKey)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [showEpisodes, showAudioMenu, showSources, showQuality, nextVisible])

  // ── Overlay scopes & BACK handling ────────────────────────────────────────
  // On Android, the native player handles all BACK and D-pad navigation.
  const skipVisible = showSkipIntro || showSkipOutro
  const controlsActive = !loading && controlsVisible && !showEpisodes && !showAudioMenu && !showSources && !showQuality && !nextVisible
  const controlsScope = useTVScope(!isAndroid && controlsActive)
  const episodesScope = useTVScope(!isAndroid && showEpisodes)
  const audioScope = useTVScope(!isAndroid && showAudioMenu)
  const sourcesScope = useTVScope(!isAndroid && showSources)
  const qualityScope = useTVScope(!isAndroid && showQuality)
  const nextScope = useTVScope(!isAndroid && nextVisible)
  const skipScope = useTVScope(!isAndroid && skipVisible)
  const androidErrorScope = useTVScope(isAndroid && !!error)
  useTVBackHandler(!isAndroid && showEpisodes, () => setShowEpisodes(false))
  useTVBackHandler(!isAndroid && showAudioMenu, () => setShowAudioMenu(false))
  useTVBackHandler(!isAndroid && showSources, () => setShowSources(false))
  useTVBackHandler(!isAndroid && showQuality, () => setShowQuality(false))
  useTVBackHandler(!isAndroid && nextVisible, () => { cancelProgression(animeId, epNum); setNextVisible(false) })
  useTVBackHandler(!isAndroid && controlsActive, () => {
    if (playing) setControlsVisible(false)
    else navigate(-1)
  })

  // ── ExoPlayer native playback (Android only) ────────────────────────
  // The native player handles ALL UI (controls, D-pad, episodes, audio, quality).
  // React only handles stream resolution, progress saving, and navigation.
  useEffect(() => {
    if (!isAndroid || !streamData || loading) return undefined
    let listeners = []
    let mounted = true
    let progressTimer = null

    ;(async () => {
      try {
        if (!ExoPlayerBridge) throw new Error('ExoPlayerBridge plugin not available')

        // Pass full config to native player
        await ExoPlayerBridge.init({
          url: proxyUrl(streamData.url, streamData.cdnHeaders),
          userAgent: 'kaisen-exo-bridge',
          animeTitle: anime?.title || '',
          currentEp: epNum,
          totalEpisodes: totalEpisodes,
          episodes: allEpisodes,
          audio: audio,
          hasSub: hasSub,
          hasDub: hasDub,
          animeId: animeId,
          provider: streamData.provider || '',
        })
        if (!mounted) return

        addContinueWatching(
          animeId, epNum, anime?.title, anime?.coverImage,
          totalEpisodes, audio, streamData.provider
        )

        // Listen for native events
        listeners.push(
          ExoPlayerBridge.addListener('onReady', (data) => {
            if (!mounted) return
            setLoading(false)
            setDuration(data?.duration || 0)
            setError(null)
          })
        )
        listeners.push(
          ExoPlayerBridge.addListener('onPlay', () => {
            if (!mounted) return
            setPlaying(true)
            setBuffering(false)
            savePreferredProvider(animeId, audio, activeProviderRef.current)
          })
        )
        listeners.push(
          ExoPlayerBridge.addListener('onPause', () => {
            if (!mounted) return
            setPlaying(false)
          })
        )
        listeners.push(
          ExoPlayerBridge.addListener('onBuffering', () => {
            if (!mounted) return
            setBuffering(true)
          })
        )
        listeners.push(
          ExoPlayerBridge.addListener('onEnded', async () => {
            if (!mounted) return
            try {
              const t = await ExoPlayerBridge.getCurrentTime()
              const d = await ExoPlayerBridge.getDuration()
              if (t?.value != null && d?.value > 0 && providerRef.current) {
                updateContinueWatchingProgress(animeId, epNum, t.value, d.value, providerRef.current)
              }
            } catch { /* ignore */ }
            if (nextEp != null && tryArm(animeId, epNum)) {
              cancelProgression(animeId, epNum)
              navigate(`/tv/watch/${animeId}/${nextEp}?audio=${audio}`)
            } else {
              navigate(`/tv/anime/${animeId}`)
            }
          })
        )
        listeners.push(
          ExoPlayerBridge.addListener('onError', (data) => {
            if (!mounted) return
            console.error('[TVPlayer] ExoPlayerBridge error:', data?.message)
            setError('Video playback error. Try again or go back.')
          })
        )
        listeners.push(
          ExoPlayerBridge.addListener('onTimeUpdate', (data) => {
            if (!mounted) return
            setCurrentTime(data?.currentTime || 0)
            setDuration(data?.duration || 0)
            setPlaying(data?.isPlaying || false)
            if (data?.buffered) setBufferedPos(data?.buffered)
          })
        )
        listeners.push(
          ExoPlayerBridge.addListener('onTracksChanged', (data) => {
            // Track info available if needed
          })
        )

        // When native player asks to switch audio (SUB/DUB), resolve new stream
        listeners.push(
          ExoPlayerBridge.addListener('onAudioSwitchRequested', (data) => {
            if (!mounted || !data?.audio) return
            cancelProgression(animeId, epNum)
            setSearchParams({ audio: data.audio })
          })
        )

        // When native player says BACK, navigate out
        listeners.push(
          ExoPlayerBridge.addListener('onBack', () => {
            if (!mounted) return
            navigate(`/tv/anime/${animeId}`, { replace: true })
          })
        )

        // When native player needs retry (error action)
        listeners.push(
          ExoPlayerBridge.addListener('onErrorAction', (data) => {
            if (!mounted) return
            if (data?.action === 'retry') attemptNextProvider()
          })
        )

        // Periodic progress save every 15s
        progressTimer = setInterval(async () => {
          try {
            const t = await ExoPlayerBridge.getCurrentTime()
            const d = await ExoPlayerBridge.getDuration()
            if (t?.value != null && d?.value > 0 && providerRef.current) {
              updateContinueWatchingProgress(animeId, epNum, t.value, d.value, providerRef.current)
            }
          } catch { /* ignore */ }
        }, 15000)
      } catch (e) {
        console.error('[TVPlayer] ExoPlayerBridge init failed:', e)
        if (mounted) {
          setError('Native player failed to start.')
          setLoading(false)
        }
      }
    })()

    return () => {
      mounted = false
      listeners.forEach((l) => l?.remove?.())
      if (progressTimer) clearInterval(progressTimer)
      ExoPlayerBridge?.destroy?.().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAndroid, streamData?.url])

  // Countdown → single transition through the shared service.
  useEffect(() => {
    if (!nextVisible) return undefined
    if (countdown <= 0) {
      if (nextEp != null) jumpTo(nextEp)
      return undefined
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [nextVisible, countdown, nextEp, jumpTo])

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const bufferedPct = (() => {
    if (isAndroid && bufferedPos > 0 && duration > 0) {
      return Math.min(100, (bufferedPos / duration) * 100)
    }
    const v = videoRef.current
    if (!v || !v.duration || !v.buffered?.length) return pct
    return Math.min(100, (v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
  })()

  // ── Android: native ExoPlayer handles all UI via ExoPlayerBridge ──
  if (isAndroid && !error) {
    return <div className="fixed inset-0 bg-black z-50" />
  }
  if (isAndroid && error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85">
        <AlertTriangle className="w-16 h-16 text-red-400" />
        <p className="text-2xl text-white/90 max-w-3xl text-center leading-relaxed">{error}</p>
        <div className="flex gap-4 mt-2">
          <CtlButton scope={androidErrorScope} label="Try Again" onClick={() => setRetryKey((k) => k + 1)} big />
          <CtlButton scope={androidErrorScope} label="Exit" onClick={() => navigate(`/tv/anime/${animeId}`)} />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 select-none">
      <video ref={videoRef} playsInline className="w-full h-full object-contain bg-black" />

      {/* Initial loading — cinematic backdrop once metadata is known */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black">
          {anime?.bannerImage || anime?.coverImage ? (
            <>
              <img src={anime.bannerImage || anime.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl scale-110" />
              <div className="absolute inset-0 bg-black/50" />
            </>
          ) : null}
          <Loader2 className="w-20 h-20 text-white animate-spin relative" />
          <p className="text-2xl text-white/90 font-semibold relative">
            {anime?.title ? anime.title : 'Loading episode…'}
          </p>
          <p className="text-lg text-white/55 relative">Episode {epLabel(epNum)}{totalEpisodes ? ` of ${totalEpisodes}` : ''}</p>
        </div>
      )}

      {/* Buffering */}
      {buffering && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-black/65 px-12 py-8">
            <Loader2 className="w-16 h-16 text-white animate-spin" />
            <p className="text-xl text-white/85 font-medium">Buffering…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <ErrorPanel message={error} onRetry={() => setRetryKey((k) => k + 1)} onExit={() => navigate(`/tv/anime/${animeId}`)} />
      )}

      {/* Top bar */}
      {controlsVisible && !loading && (
        <div className="absolute top-0 left-0 right-0 p-10 tv-player-top pointer-events-none">
          <p className="text-3xl font-bold text-white drop-shadow">{anime?.title || 'Loading…'}</p>
          <p className="text-xl text-white/70 mt-1.5 drop-shadow">
            Episode {epLabel(epNum)}{totalEpisodes ? ` of ${totalEpisodes}` : ''}
            {' · '}{audio === 'dub' ? 'DUB' : 'SUB'}
            {activeProvider ? ` · ${activeProvider}` : ''}
            {providers.length > 1 ? ` · ${providers.length} sources` : ''}
          </p>
        </div>
      )}

      {/* Up Next overlay */}
      {nextVisible && (
        <NextOverlay
          scope={nextScope}
          nextEp={nextEp}
          countdown={countdown}
          total={COUNTDOWN_SECONDS}
          title={anime?.title}
          onWatch={() => jumpTo(nextEp)}
          onCancel={() => { cancelProgression(animeId, epNum); setNextVisible(false) }}
        />
      )}

      {/* Skip Intro / Outro — visible even when the control bar is hidden */}
      {skipVisible && (
        <div className="absolute bottom-16 right-16 z-30">
          <SkipChip
            scope={skipScope}
            type={showSkipIntro ? 'intro' : 'outro'}
            onClick={() => skipChapter(showSkipIntro ? 'intro' : 'outro')}
          />
        </div>
      )}

      {/* Audio menu */}
      {showAudioMenu && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="rounded-3xl bg-[#111827] border border-white/15 p-12 w-[560px] shadow-2xl">
            <h2 className="text-3xl font-bold mb-2">Audio Track</h2>
            <p className="text-lg text-white/50 mb-8">Switching reloads this episode.</p>
            <div className="flex flex-col gap-4">
              <MenuOption scope={audioScope} label="Japanese (SUB)" selected={audio === 'sub'} disabled={!hasSub} onClick={() => switchAudio('sub')} />
              <MenuOption scope={audioScope} label="English (DUB)" selected={audio === 'dub'} disabled={!hasDub} onClick={() => switchAudio('dub')} />
            </div>
            {!hasDub && (
              <p className="flex items-center gap-2 text-white/40 text-lg mt-6">
                <Lock className="w-5 h-5" /> Dub is not available for this episode.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Source menu */}
      {showSources && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="rounded-3xl bg-[#111827] border border-white/15 p-12 w-[560px] shadow-2xl">
            <h2 className="text-3xl font-bold mb-2">Source</h2>
            <p className="text-lg text-white/50 mb-8">Your position carries over when you switch.</p>
            <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto tv-row-scroll pr-1">
              {(providers.length ? providers : [activeProvider].filter(Boolean)).map((p) => (
                <MenuOption
                  key={p}
                  scope={sourcesScope}
                  label={String(p)}
                  selected={p === activeProvider}
                  onClick={() => { setShowSources(false); if (p !== activeProvider) switchToProvider(p) }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quality menu */}
      {showQuality && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="rounded-3xl bg-[#111827] border border-white/15 p-12 w-[560px] shadow-2xl">
            <h2 className="text-3xl font-bold mb-2">Quality</h2>
            <p className="text-lg text-white/50 mb-8">Switching keeps playback running.</p>
            <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto tv-row-scroll pr-1">
              <MenuOption
                scope={qualityScope}
                label="Auto"
                selected={selectedLevel === -1}
                onClick={() => { setShowQuality(false); applyQuality(-1) }}
              />
              {qualityLevels.map((l) => (
                <MenuOption
                  key={l.index}
                  scope={qualityScope}
                  label={qualityLabel(l.height)}
                  selected={selectedLevel === l.index}
                  onClick={() => { setShowQuality(false); applyQuality(l.index) }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Episode drawer */}
      {showEpisodes && (
        <EpisodeDrawer
          scope={episodesScope}
          title={anime?.title}
          episodes={allEpisodes}
          current={epNum}
          onPick={(n) => jumpTo(n)}
          onClose={() => setShowEpisodes(false)}
        />
      )}

      {/* Control bar */}
      {controlsVisible && !loading && !error && (
        <div className="absolute bottom-0 left-0 right-0 z-10 px-12 pb-8 pt-16 tv-player-controls">
          {/* Seekbar row */}
          <SeekBar
            scope={controlsScope}
            pct={pct}
            bufferedPct={bufferedPct}
            duration={duration}
            preview={seekPreview}
            onArrow={(dir) => {
              if (!duration) return false
              const base = seekPreview != null ? seekPreview : currentTime
              const step = dir === 'left' ? -30 : 30
              const next = Math.max(0, Math.min(duration - 0.5, base + step))
              setSeekPreview(next)
              clearTimeout(seekBarCommitRef.current)
              seekBarCommitRef.current = setTimeout(() => applySeek(next), 450)
              return true // consume the key; focus stays on the bar
            }}
            onToggle={togglePlay}
          />

          <div className="flex items-center justify-between text-lg text-white/75 mt-3 mb-4 font-medium tabular-nums">
            <span>{fmt(seekPreview != null ? seekPreview : currentTime)}</span>
            <span className="text-white/90 font-semibold">EP {epLabel(epNum)}{totalEpisodes ? ` / ${totalEpisodes}` : ''}</span>
            <span>{fmt(duration)}</span>
          </div>

          {/* Control row — single icon-only line like leanback players
              (labels live in aria-labels); wraps as a safety net */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-4">
            <CtlButton scope={controlsScope} icon={Rewind10} label="-10 seconds" big iconOnly onClick={() => seekBy(-10)} visualOrder="order-1" />
            <CtlButton scope={controlsScope} icon={SkipBack} label="Previous episode" iconOnly disabled={!prevEp} onClick={() => jumpTo(prevEp)} visualOrder="order-2" />
            <PlayPauseButton scope={controlsScope} playing={playing} onClick={togglePlay} visualOrder="order-3" />
            <CtlButton scope={controlsScope} icon={SkipForward} label="Next episode" iconOnly disabled={nextEp == null} onClick={() => jumpTo(nextEp)} visualOrder="order-4" />
            <CtlButton scope={controlsScope} icon={Forward10} label="+10 seconds" big iconOnly onClick={() => seekBy(10)} visualOrder="order-5" />

            <div className="w-px h-10 bg-white/15 mx-1 order-6" />

            <SegmentedAudio scope={controlsScope} audio={audio} hasSub={hasSub} hasDub={hasDub} onSwitch={switchAudio} visualOrder="order-7" />
            {streamData?.tracks?.length > 0 && (
              <CtlButton scope={controlsScope} icon={Subtitles} label={subsOn ? 'Subtitles on' : 'Subtitles off'} iconOnly active={subsOn} onClick={() => setSubsOn((v) => !v)} visualOrder="order-8" />
            )}
            <CtlButton scope={controlsScope} icon={Settings} label="Quality" iconOnly disabled={!qualityLevels.length} onClick={() => setShowQuality(true)} visualOrder="order-9" />
            <CtlButton scope={controlsScope} icon={Server} label="Source" iconOnly disabled={!providers.length && !activeProvider} onClick={() => setShowSources(true)} visualOrder="order-10" />
            <CtlButton scope={controlsScope} icon={List} label="Episodes" iconOnly onClick={() => setShowEpisodes(true)} visualOrder="order-11" />
            <CtlButton scope={controlsScope} icon={X} label="Exit player" iconOnly onClick={() => navigate(`/tv/anime/${animeId}`)} visualOrder="order-12" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Control-bar pieces ───────────────────────────────────────────────────────

function CtlButton({ icon: Icon, label, onClick, disabled = false, big = false, active = false, iconOnly = false, scope, visualOrder = '' }) {
  const focus = useFocusable({ onSelect: onClick, disabled, scope })
  if (iconOnly) {
    return (
      <button
        ref={focus.ref}
        type="button"
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
        className={`tv-card inline-flex items-center justify-center rounded-xl border transition-colors ${
          big ? 'w-[54px] h-[54px]' : 'w-12 h-12'
        } ${visualOrder} ${disabled ? 'opacity-35 pointer-events-none' : ''} ${
          active
            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
            : 'bg-white/10 border-white/15 text-white'
        }`}
      >
        {Icon && <Icon className={big ? 'w-6 h-6' : 'w-5 h-5'} />}
      </button>
    )
  }
  return (
    <button
      ref={focus.ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`tv-card inline-flex items-center gap-3 rounded-2xl font-semibold border transition-colors ${
        big ? 'px-6 py-4 text-xl' : 'px-5 py-3 text-lg'
      } ${visualOrder} ${disabled ? 'opacity-35 pointer-events-none' : ''} ${
        active ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200' : 'bg-white/10 border-white/20 text-white'
      }`}
    >
      {Icon && <Icon className={big ? 'w-7 h-7' : 'w-6 h-6'} />}
      {label}
    </button>
  )
}

function PlayPauseButton({ playing, onClick, scope, visualOrder = '' }) {
  const focus = useFocusable({ onSelect: onClick, scope })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      aria-label={playing ? 'Pause' : 'Play'}
      className={`${visualOrder} tv-card w-16 h-16 rounded-full flex items-center justify-center text-black shadow-[0_8px_32px_rgba(124,58,237,0.5)]`}
      style={{
        background: 'linear-gradient(135deg, var(--color-primary-light, #a78bfa), var(--color-primary, #7c3aed))',
      }}
    >
      {playing ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
    </button>
  )
}

function SeekBar({ scope, pct, bufferedPct, duration, preview, onArrow, onToggle }) {
  const focus = useFocusable({ onSelect: onToggle, onArrow, scope })
  const toPct = (t) => (duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0)
  return (
    <div
      ref={focus.ref}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="cursor-pointer py-4"
    >
      <div className="relative h-3.5 rounded-full bg-white/15">
        {/* buffered */}
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${bufferedPct}%` }} />
        {/* played */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))' }}
        />
        {/* seek preview ghost */}
        {preview != null && (
          <>
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${toPct(preview)}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.9)]"
              style={{ left: `${toPct(preview)}%` }}
            />
          </>
        )}
        {/* playhead */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white transition-all ${
            preview != null ? 'w-3.5 h-3.5 opacity-70' : 'w-4 h-4'
          }`}
          style={{ left: `${toPct(pct)}%` }}
        />
      </div>
    </div>
  )
}

function SegmentedAudio({ audio, hasSub, hasDub, onSwitch, scope, visualOrder = '' }) {
  const subFocus = useFocusable({ onSelect: () => onSwitch('sub'), disabled: !hasSub || audio === 'sub', scope })
  const dubFocus = useFocusable({ onSelect: () => onSwitch('dub'), disabled: !hasDub || audio === 'dub', scope })
  const chip = (active, available) =>
    `px-3.5 py-2.5 text-base font-bold inline-flex items-center gap-1.5 transition-colors ${
      active
        ? 'bg-[var(--color-primary)] text-white'
        : available
          ? 'bg-white/10 text-white/80'
          : 'bg-white/5 text-white/35'
    }`
  return (
    <div className={`${visualOrder} inline-flex rounded-xl overflow-hidden border border-white/20`}>
      <button
        ref={subFocus.ref}
        type="button"
        disabled={!hasSub || audio === 'sub'}
        onClick={() => onSwitch('sub')}
        className={chip(audio === 'sub', hasSub)}
      >
        {!hasSub && <Lock className="w-4 h-4" />} SUB
      </button>
      <button
        ref={dubFocus.ref}
        type="button"
        disabled={!hasDub || audio === 'dub'}
        onClick={() => onSwitch('dub')}
        className={chip(audio === 'dub', hasDub)}
      >
        {!hasDub && <Lock className="w-4 h-4" />} DUB
      </button>
    </div>
  )
}

function SkipChip({ scope, type, onClick }) {
  const focus = useFocusable({ onSelect: onClick, scope })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      className="tv-card inline-flex items-center gap-3 rounded-2xl bg-black/55 backdrop-blur-md border border-white/25 px-8 py-4 text-xl font-bold text-white"
    >
      <SkipForward className="w-6 h-6" /> Skip {type === 'intro' ? 'Intro' : 'Outro'}
    </button>
  )
}

function MenuOption({ label, selected, disabled, onClick, scope }) {
  const focus = useFocusable({ onSelect: onClick, disabled, scope })
  return (
    <button
      ref={focus.ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`tv-card flex items-center justify-between rounded-2xl px-8 py-6 text-2xl font-semibold border ${
        selected ? 'bg-[var(--color-primary)] border-transparent' : 'bg-white/5 border-white/15'
      } ${disabled ? 'opacity-35 pointer-events-none' : ''}`}
    >
      {label}
      {selected ? <Check className="w-7 h-7" /> : disabled ? <Lock className="w-6 h-6" /> : null}
    </button>
  )
}

function EpisodeDrawer({ scope, title, episodes, current, onPick, onClose }) {
  const [page, setPage] = useState(() => {
    const idx = episodes.findIndex((n) => n === current)
    return idx >= 0 ? Math.floor(idx / DRAWER_PAGE_SIZE) : 0
  })
  const pageCount = Math.max(1, Math.ceil(episodes.length / DRAWER_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = episodes.slice(safePage * DRAWER_PAGE_SIZE, (safePage + 1) * DRAWER_PAGE_SIZE)

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-16">
      <div className="rounded-3xl bg-[#111827] border border-white/15 p-10 w-full max-w-[1600px] max-h-[84vh] flex flex-col">
        <div className="flex items-center gap-6 mb-8 shrink-0">
          <CloseButton scope={scope} onClick={onClose} />
          <h2 className="text-3xl font-bold truncate">
            Episodes{title ? ` — ${title}` : ''}
            <span className="text-white/40 text-2xl ml-3">{episodes.length}</span>
          </h2>
          {pageCount > 1 && (
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <PageButton scope={scope} dir={-1} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} />
              <span className="text-xl text-white/60 tabular-nums">{safePage + 1} / {pageCount}</span>
              <PageButton scope={scope} dir={1} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} />
            </div>
          )}
        </div>
        <div key={safePage} className="grid grid-cols-8 gap-4 overflow-y-auto pr-2 tv-row-scroll">
          {slice.map((n) => (
            <EpisodeChip key={n} n={n} current={n === current} scope={scope} autoFocus={n === current} onClick={() => onPick(n)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function CloseButton({ scope, onClick }) {
  const focus = useFocusable({ onSelect: onClick, scope })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      aria-label="Close episodes"
      className="tv-card w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0"
    >
      <X className="w-7 h-7" />
    </button>
  )
}

function PageButton({ scope, dir, disabled, onClick }) {
  const focus = useFocusable({ onSelect: onClick, disabled, scope })
  return (
    <button
      ref={focus.ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={dir < 0 ? 'Previous page' : 'Next page'}
      className={`tv-card w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-2xl font-bold ${
        disabled ? 'opacity-30 pointer-events-none' : ''
      }`}
    >
      {dir < 0 ? '‹' : '›'}
    </button>
  )
}

function EpisodeChip({ n, current, scope, autoFocus, onClick }) {
  const focus = useFocusable({ onSelect: onClick, scope, autoFocus })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      className={`tv-card rounded-2xl py-5 text-xl font-bold border ${
        current ? 'bg-[var(--color-primary)] text-white border-transparent' : 'bg-white/5 text-white/85 border-white/10'
      }`}
    >
      EP {epLabel(n)}
    </button>
  )
}

function NextOverlay({ scope, nextEp, countdown, total, title, onWatch, onCancel }) {
  // SVG countdown ring: r=30 → circumference ≈ 188.5
  const R = 30
  const C = 2 * Math.PI * R
  const frac = Math.max(0, Math.min(1, countdown / (total || 1)))
  return (
    <div className="absolute bottom-44 right-16 z-30 rounded-3xl bg-[#111827]/95 backdrop-blur border border-white/15 p-10 w-[540px] shadow-2xl">
      <p className="text-xl font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--color-primary-light, #a78bfa)' }}>Up Next</p>
      <h3 className="text-2xl font-bold mb-1 truncate">{title || 'Next episode'}</h3>
      <p className="text-xl text-white/60 mb-8">Episode {epLabel(nextEp)}</p>
      <div className="flex items-center gap-8">
        <CtlButton scope={scope} label="Watch Now" onClick={onWatch} big />
        <CtlButton scope={scope} label="Cancel" onClick={onCancel} />
        <div className="relative ml-auto w-20 h-20 shrink-0">
          <svg viewBox="0 0 72 72" className="w-20 h-20 -rotate-90">
            <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
            <circle
              cx="36" cy="36" r={R} fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-3xl font-black tabular-nums">{countdown}</span>
        </div>
      </div>
    </div>
  )
}

function ErrorPanel({ message, onRetry, onExit }) {
  const scope = useTVScope(true)
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/85">
      <AlertTriangle className="w-16 h-16 text-red-400" />
      <p className="text-2xl text-white/90 max-w-3xl text-center leading-relaxed">{message}</p>
      <div className="flex gap-4 mt-2">
        <CtlButton scope={scope} label="Try Again" onClick={onRetry} big />
        <CtlButton scope={scope} label="Exit" onClick={onExit} />
      </div>
    </div>
  )
}

