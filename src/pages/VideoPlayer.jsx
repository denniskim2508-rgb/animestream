import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import { ChevronLeft, Play, Pause, List, SkipForward, SkipBack, AlertCircle, Loader2, RefreshCw, Tv, Volume2, VolumeX, RotateCcw, Maximize, Minimize, Search, Check, BookOpen, Settings } from 'lucide-react'
import { fetchMediaById } from '../api/anilist'
import { resolveStream, fetchEpisodeAvailability } from '../api/anikoto'
import { useAuth } from '../context/AuthContext'
import CommentSection from '../components/CommentSection'
import NextEpisodeOverlay from '../components/ui/NextEpisodeOverlay'
import { findMangaForAnime } from '../api/crosslink'
import { getAdaptation } from '../api/manga'
import { loadVideoSettings, saveVideoSetting, loadAudioPreference } from '../utils/videoSettings'
import { buildEpisodeList, getNextEpisode, tryArm, cancel as cancelProgression } from '../utils/episodeProgression'
import { API_BASE } from '../api/base'

function encodeHeaders(headers) {
  return btoa(JSON.stringify(headers)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function proxyUrl(url, cdnHeaders) {
  return `${API_BASE}/api/media/proxy?url=${encodeURIComponent(url)}&h=${encodeHeaders(cdnHeaders || {})}`
}

// A provider is only considered to have "started" once the video element
// actually produces frames. If it can't begin playback within this window it is
// treated as failed and the player falls back to the next provider.
const PLAYBACK_STARTUP_TIMEOUT_MS = 12000

// Per-anime provider preference: the last provider that actually played an
// episode of this anime (keyed by anime + audio, since sub/dub may use
// different providers). Used to avoid defaulting back to providers[0] every time
// the player is recreated.
function getPreferredProvider(animeId, audio) {
  try {
    const map = JSON.parse(localStorage.getItem('providerPrefs') || '{}')
    return map[`${animeId}:${audio}`] || null
  } catch {
    return null
  }
}

function savePreferredProvider(animeId, audio, provider) {
  try {
    const map = JSON.parse(localStorage.getItem('providerPrefs') || '{}')
    map[`${animeId}:${audio}`] = provider
    localStorage.setItem('providerPrefs', JSON.stringify(map))
  } catch {
    /* silent */
  }
}

export default function VideoPlayer() {
  const { animeId, episode } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const audioMode = searchParams.get('audio') || user?.preferredAudio || loadAudioPreference() || 'sub'
  const currentEp = Number(episode) || 1
  const [totalEpisodes, setTotalEpisodes] = useState(() => Number(searchParams.get('total')) || 0)

  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  // Monotonic request id guards against stale async work: only the latest load
  // or provider switch may write state. Providers/sources that finish late after
  // a newer request started are ignored.
  const loadRequestRef = useRef(0)
  // Position to restore once a source becomes ready (Continue Watching resume,
  // or the live position when switching providers).
  const resumeTargetRef = useRef(null)
  // The in-flight playback verification for the current source load.
  const pendingVerifyRef = useRef(null)
  const activeProviderRef = useRef(null)
  const cwAddedRef = useRef(false)

  const [anime, setAnime] = useState(null)
  const [streamData, setStreamData] = useState(null)
  const [streamKey, setStreamKey] = useState(0)
  const [checkingProvider, setCheckingProvider] = useState(false)
  // Whether the current video is stuck waiting for data. Only set after the
  // stall has persisted (see buffering effect) so tiny network hiccups never
  // flash the indicator.
  const [buffering, setBuffering] = useState(false)
  const [loading, setLoading] = useState(true)
  const [streamError, setStreamError] = useState(null)
  const [showEpisodeList, setShowEpisodeList] = useState(false)
  const [providers, setProviders] = useState([])
  const [activeProvider, setActiveProvider] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  const [providerError, setProviderError] = useState(null)
  const [cdnHeaders, setCdnHeaders] = useState({})
  const [hasSub, setHasSub] = useState(true)
  const [hasDub, setHasDub] = useState(false)
  const { user, addContinueWatching, updateContinueWatchingProgress, addWatchMinutes, setAudioMode } = useAuth()

  const [showNextEpisode, setShowNextEpisode] = useState(false)
  const [nextEpLoading, setNextEpLoading] = useState(false)
  const [showSeasonComplete, setShowSeasonComplete] = useState(false)
  const nextEpTriggeredRef = useRef(false)
  // Single transition lock for the next-episode advance. It is the ONLY guard
  // shared by the countdown, the real 'ended' event, the Watch Now button, and
  // manual navigation, so at most one transition can ever fire per episode.
  // Reset whenever the popup closes (see below) or the episode changes.
  const transitionLockRef = useRef(false)
  // Refreshed during render so effect cleanups that run after a navigation see
  // the NEW episode and skip saving stale progress for the old one.
  const currentEpRef = useRef(currentEp)
  currentEpRef.current = currentEp
  // Counts how many times the video 'ended' handler fires for this page load
  // (a double-ended would show up here even if it never skips an episode).
  const endedCountRef = useRef(0)
  const watchStartRef = useRef(Date.now())
  const lastSaveRef = useRef(0)
  const cwRef = useRef(user?.continueWatching || [])
  const saveProgressRef = useRef(null)
  const loadEpisodeRef = useRef(null)
  const [linkedManga, setLinkedManga] = useState(null)
  const [mangaLoading, setMangaLoading] = useState(false)
  // Where to continue in the manga after this episode, from the adaptation
  // endpoint (AI resolver + wdalo/fandom/wikipedia evidence). Distinct from
  // linkedManga.latestChapter, which is just the newest chapter number.
  const [adaptation, setAdaptation] = useState(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  // Hides the cursor over the player after a period of inactivity while the
  // video is playing (never on touch-only devices). Driven by an idle timer so
  // it is never permanently `cursor: none`.
  const [cursorHidden, setCursorHidden] = useState(false)
  // Touch-only devices have no mouse cursor to hide; pointer: coarse detects
  // phones/tablets where the auto-hide logic should not run.
  const [isCoarsePointer] = useState(() => {
    if (typeof window === 'undefined') return false
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(() => loadVideoSettings().playbackRate)
  const [autoSkip, setAutoSkip] = useState(() => loadVideoSettings().autoSkip)
  const [qualityLevels, setQualityLevels] = useState([])
  const [selectedLevel, setSelectedLevel] = useState(-1)
  const [introSkipped, setIntroSkipped] = useState(false)
  const [outroSkipped, setOutroSkipped] = useState(false)
  const [episodeSearch, setEpisodeSearch] = useState('')
  const containerRef = useRef(null)
  const episodeSearchRef = useRef(null)
  const controlsTimeoutRef = useRef(null)
  const settingsOpenRef = useRef(false)

  const hasNextEpisode = totalEpisodes > 0 && currentEp < totalEpisodes

  const autoplayEnabled = loadVideoSettings().autoplay

  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  const qualityLabel = (h) => {
    if (h >= 1080) return '1080p'
    if (h >= 720) return '720p'
    if (h >= 480) return '480p'
    if (h >= 360) return '360p'
    return h ? `${h}p` : 'Auto'
  }

  function handleQualityChange(index) {
    const hls = hlsRef.current
    if (!hls) return
    // Setting currentLevel swaps renditions in place: playback position and
    // the playing/paused state are preserved (no reload, no restart).
    setSelectedLevel(index)
    hls.currentLevel = index === -1 ? -1 : index
  }

  function handleSpeedChange(rate) {
    const video = videoRef.current
    if (video) video.playbackRate = rate
    setPlaybackRate(rate)
    saveVideoSetting('playbackRate', rate)
  }

  function handleAutoSkipToggle() {
    const next = !autoSkip
    setAutoSkip(next)
    saveVideoSetting('autoSkip', next)
  }

  function closeSettings() {
    setShowSettings(false)
    settingsOpenRef.current = false
  }

  function toggleSettings() {
    const next = !showSettings
    setShowSettings(next)
    settingsOpenRef.current = next
    resetControlsTimer()
  }

  // Playback verification: a provider only counts as "selected" once the video
  // element actually starts producing frames. A source that resolves to a URL
  // but stalls, throws, or stays black on its first frame is treated as failed
  // so the player can fall back to the next provider.
  const armVerification = useCallback(() => {
    if (pendingVerifyRef.current) pendingVerifyRef.current.dispose()
    let settled = false
    let safetyTimer = null
    const disposers = []
    let resolveFn = null
    const pending = {
      resolve: (ok) => {
        if (settled) return
        settled = true
        if (safetyTimer) clearTimeout(safetyTimer)
        disposers.forEach((fn) => { try { fn() } catch { /* noop */ } })
        pendingVerifyRef.current = null
        resolveFn?.(ok)
      },
      isSettled: () => settled,
      dispose: () => {
        if (settled) return
        settled = true
        if (safetyTimer) clearTimeout(safetyTimer)
        disposers.forEach((fn) => { try { fn() } catch { /* noop */ } })
        pendingVerifyRef.current = null
        resolveFn?.(false)
      },
      addDisposer: (fn) => disposers.push(fn),
    }
    pendingVerifyRef.current = pending
    const promise = new Promise((res) => { resolveFn = res })
    safetyTimer = setTimeout(() => pending.resolve(false), PLAYBACK_STARTUP_TIMEOUT_MS)
    return { pending, promise }
  }, [])

  // Watches a freshly attached <video> and reports whether it becomes playable.
  // A provider only passes once the element actually fires 'playing' AND frames
  // advance past the starting position (so a seeked-but-stuck or black first
  // frame still counts as a failure). Uses the `pending` captured by the effect
  // that armed it so a slow manifest from a previous provider can never resolve
  // a newer provider's check.
  const watchSource = useCallback((video, pending) => {
    if (!pending || pending.isSettled()) return
    if (video.currentTime > 0.5 && !video.paused && video.readyState >= 2) {
      pending.resolve(true)
      return
    }

    let startedAt = null
    const onPlaying = () => { startedAt = video.currentTime || 0 }
    const onTimeUpdate = () => {
      if (startedAt != null && video.currentTime > startedAt + 0.2) {
        pending.resolve(true)
      }
    }
    const onError = () => pending.resolve(false)
    video.addEventListener('playing', onPlaying, { once: true })
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('error', onError, { once: true })
    pending.addDisposer(() => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('error', onError)
    })

    const attemptPlay = () => {
      video.play().catch((err) => {
        // Autoplay blocked by the browser is not a provider failure as long as
        // the source actually decoded.
        if (err?.name === 'NotAllowedError') {
          if (video.readyState >= 2) {
            pending.resolve(true)
            return
          }
          const onLoadedData = () => pending.resolve(true)
          video.addEventListener('loadeddata', onLoadedData, { once: true })
          pending.addDisposer(() => video.removeEventListener('loadeddata', onLoadedData))
        } else {
          pending.resolve(false)
        }
      })
    }

    if (!video.paused) {
      attemptPlay()
      return
    }
    if (video.readyState >= 2) {
      attemptPlay()
    } else {
      const onCanPlay = () => attemptPlay()
      video.addEventListener('canplay', onCanPlay, { once: true })
      pending.addDisposer(() => video.removeEventListener('canplay', onCanPlay))
    }
  }, [])

  useEffect(() => {
    cwRef.current = user?.continueWatching || []
  }, [user?.continueWatching])

  useEffect(() => {
    if (showEpisodeList && episodeSearchRef.current) {
      setTimeout(() => episodeSearchRef.current?.focus(), 100)
    }
    if (!showEpisodeList) setEpisodeSearch('')
  }, [showEpisodeList])

  useEffect(() => {
    if (!videoRef.current || !streamData?.url) return
    const video = videoRef.current
    const url = streamData.url
    // Only the verification armed for THIS source may report playback results;
    // a slow manifest from a previous provider must never resolve the current
    // provider's check.
    const sourceVerification = pendingVerifyRef.current

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    setQualityLevels([])
    setSelectedLevel(-1)
    setShowSettings(false)
    settingsOpenRef.current = false
    setPlaying(false)

    // Restore playback position only once the source is actually ready.
    const restorePosition = () => {
      const target = resumeTargetRef.current
      if (target != null && target > 5 && isFinite(target)) {
        try { video.currentTime = target } catch { /* ignore */ }
      }
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr, reqUrl) => {
          let u
          try { u = new URL(reqUrl, window.location.origin) } catch { u = null }
          if (u && u.pathname.endsWith('/api/media/proxy')) return
          xhr.open('GET', proxyUrl(reqUrl, cdnHeaders), true)
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
        restorePosition()
        if (pendingVerifyRef.current === sourceVerification) watchSource(video, sourceVerification)
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (typeof data.level === 'number') setSelectedLevel(data.level)
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[HLS] Fatal error:', data.type, data.details)
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
          } else {
            setStreamError('Video playback error. Try another provider.')
            sourceVerification?.resolve(false)
          }
        }
      })

      if (streamData.tracks?.length) {
        video.querySelectorAll('track').forEach((t) => t.remove())
        streamData.tracks.forEach((track, i) => {
          try {
            const url = proxyUrl(track.url, cdnHeaders)
            const el = document.createElement('track')
            el.kind = 'subtitles'
            el.label = track.label || track.lang
            el.srclang = track.lang || 'en'
            el.src = url
            el.default = i === 0
            video.appendChild(el)
          } catch (e) {
            console.warn('[HLS] Could not add subtitle track:', e.message)
          }
        })
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.addEventListener('loadedmetadata', () => {
        restorePosition()
        if (pendingVerifyRef.current === sourceVerification) watchSource(video, sourceVerification)
      }, { once: true })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [streamData, cdnHeaders, retryKey, watchSource])

  // Keep the persisted playback speed applied to the (persistent) video element.
  useEffect(() => {
    const video = videoRef.current
    if (video) video.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const ep = currentEp

    const doSave = () => {
      // A save that fires after the user moved to another episode (e.g. the
      // cleanup below running post-navigation) must not overwrite the newer
      // episode's Continue Watching entry with stale data.
      if (currentEpRef.current !== ep) return
      if (!video.duration || video.duration <= 0 || !isFinite(video.duration)) return
      if (video.currentTime < 30) return
      console.log('[Episode Debug] CW saved: ep', ep, 'time', Math.round(video.currentTime), '/', Math.round(video.duration))
      updateContinueWatchingProgress(animeId, ep, video.currentTime, video.duration, activeProviderRef.current)
    }

    saveProgressRef.current = doSave

    const onTimeUpdate = () => {
      const now = Date.now()
      if (now - lastSaveRef.current < 8000) return
      lastSaveRef.current = now
      doSave()
    }

    const onPause = () => { doSave() }

    const onBeforeUnload = () => { doSave() }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('pause', onPause)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('pause', onPause)
      window.removeEventListener('beforeunload', onBeforeUnload)
      doSave()
    }
  }, [animeId, currentEp, streamData])

  // Buffering indicator: only surfaces while the element is actively waiting for
  // data (never when paused), and only once the stall has lasted ~400ms so a
  // brief network blip doesn't flash the spinner. Listeners follow the element
  // (remounted per provider via streamKey).
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let timer = null

    const hide = () => {
      if (timer) { clearTimeout(timer); timer = null }
      setBuffering(false)
    }
    const onWaiting = () => {
      if (video.paused) return
      if (timer) return
      timer = setTimeout(() => { timer = null; setBuffering(true) }, 400)
    }

    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', hide)
    video.addEventListener('canplay', hide)
    video.addEventListener('pause', hide)

    return () => {
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', hide)
      video.removeEventListener('canplay', hide)
      video.removeEventListener('pause', hide)
      if (timer) clearTimeout(timer)
    }
  }, [streamKey])

  // Source lifecycle diagnostics + a safety net for the next-episode transition:
  // logs every load/playback event the current source fires, and guarantees the
  // "Loading next episode..." state is cleared once the new source actually
  // becomes playable (or errors out) so a transition can never leave the popup
  // spinner stuck. Listeners re-arm per source via streamKey.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const log = (name) => console.log(`[Episode Debug] source: ${name} (ep ${currentEp}, streamKey ${streamKey})`)
    const onLoadStart = () => log('loadstart')
    const onLoadedMetadata = () => { log('loadedmetadata'); setDuration(video.duration) }
    const onLoadedData = () => log('loadeddata')
    const onCanPlay = () => { log('canplay'); setNextEpLoading(false) }
    const onPlaying = () => { log('playing'); setNextEpLoading(false) }
    const onWaiting = () => log('waiting')
    const onStalled = () => log('stalled')
    const onError = () => { log('error'); setNextEpLoading(false) }
    const onEnded = () => log('ended (source)')

    video.addEventListener('loadstart', onLoadStart)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('error', onError)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('loadstart', onLoadStart)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('error', onError)
      video.removeEventListener('ended', onEnded)
    }
  }, [streamKey, currentEp])

  useEffect(() => {
    if (!animeId || !currentEp) return
    let cancelled = false
    fetchEpisodeAvailability(animeId, currentEp)
      .then((avail) => {
        if (cancelled) return
        setHasSub(!!avail.hasSub)
        setHasDub(!!avail.hasDub)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [animeId, currentEp])

  // Resolve the best provider for the current episode and keep trying providers
  // until one actually starts playing. Provider preference order:
  //   1. the provider that previously played this anime (or was saved on the
  //      Continue Watching record),
  //   2. the backend's default pick,
  //   3. the remaining available providers.
  // A provider only wins once its source has been verified as playable, and a
  // per-load request id ensures a stale attempt can never clobber a newer one.
  const loadEpisode = useCallback(async (opts) => {
    const reqId = ++loadRequestRef.current
    const tried = new Set()
    cwAddedRef.current = false
    setStreamError(null)
    setProviderError(null)
    setLoading(true)

    const resumeOverride = opts?.resume
    resumeTargetRef.current = resumeOverride ?? null
    if (!resumeOverride) {
      const cw = cwRef.current.find(
        (e) => e.animeId === String(animeId) && e.episode === Number(currentEp)
      )
      if (cw && cw.currentTime > 5 && cw.duration > 0) {
        resumeTargetRef.current = cw.currentTime
      }
    }

    const preferred = getPreferredProvider(animeId, audioMode)
      || cwRef.current.find((e) => e.animeId === String(animeId))?.provider
      || null

    let animeData = null
    try {
      animeData = await fetchMediaById(animeId)
    } catch {
      if (loadRequestRef.current !== reqId) return
      setStreamError('Failed to load anime data')
      setLoading(false)
      return
    }
    if (loadRequestRef.current !== reqId) return
    setAnime(animeData)
    if (animeData.episodes) setTotalEpisodes((prev) => (animeData.episodes > (prev || 0) ? animeData.episodes : prev))

    let providersList = []

    const attempt = async (providerId) => {
      if (loadRequestRef.current !== reqId) return null
      let result
      try {
        result = await resolveStream(animeId, currentEp, audioMode, providerId || undefined)
      } catch (err) {
        console.warn(`[VideoPlayer] resolve failed (${providerId || 'default'}):`, err?.message)
        return null
      }
      if (loadRequestRef.current !== reqId) return null
      if (!providersList.length) providersList = result.providers || []
      if (tried.has(result.provider)) return null
      tried.add(result.provider)
      return result
    }

    const verify = async (result) => {
      setStreamKey((k) => k + 1)
      setStreamData(null)
      setCdnHeaders(result.cdnHeaders || {})
      setActiveProvider(result.provider)
      activeProviderRef.current = result.provider
      setProviders(result.providers || [])
      if (result.totalEpisodes) setTotalEpisodes((prev) => (result.totalEpisodes > (prev || 0) ? result.totalEpisodes : prev))
      if (result.hasSub != null) setHasSub(result.hasSub)
      if (result.hasDub != null) setHasDub(result.hasDub)
      setCheckingProvider(true)
      const { promise } = armVerification()
      setStreamData(result)
      const ok = await promise
      setCheckingProvider(false)
      if (loadRequestRef.current !== reqId) return null
      if (!ok) {
        setStreamData(null)
        return null
      }
      return result
    }

    const attemptAndVerify = async (providerId) => {
      const result = await attempt(providerId)
      return result ? verify(result) : null
    }

    console.log('[VideoPlayer] Resolving stream:', animeData.title, 'ep', currentEp, audioMode, `preferred=${preferred || 'none'}`)
    let winner = preferred ? await attemptAndVerify(preferred) : null
    if (!winner) winner = await attemptAndVerify(null)
    if (!winner) {
      for (const p of providersList) {
        if (loadRequestRef.current !== reqId) return
        if (tried.has(p.id)) continue
        const result = await attempt(p.id)
        if (!result) continue
        winner = await verify(result)
        if (winner) break
      }
    }

    if (loadRequestRef.current !== reqId) return
    setLoading(false)
    setCheckingProvider(false)
    if (winner) {
      console.log('[VideoPlayer] Playback verified via', winner.provider)
      activeProviderRef.current = winner.provider
      savePreferredProvider(animeId, audioMode, winner.provider)
      resumeTargetRef.current = null
      if (!cwAddedRef.current) {
        cwAddedRef.current = true
        addContinueWatching(
          animeId,
          currentEp,
          animeData?.title || '',
          animeData?.coverImage || '',
          animeData?.episodes || 0,
          audioMode,
          winner.provider
        )
      }
    } else {
      setStreamError('No playable provider found. Please retry or pick another provider.')
    }
  }, [animeId, currentEp, audioMode, addContinueWatching, armVerification])

  useEffect(() => { loadEpisodeRef.current = loadEpisode }, [loadEpisode])

  useEffect(() => {
    if (!animeId || !currentEp) return
    loadEpisode()
    return () => {
      loadRequestRef.current++
      const elapsed = (Date.now() - watchStartRef.current) / 60000
      if (elapsed > 0.5) addWatchMinutes(Math.round(elapsed))
    }
  }, [animeId, currentEp, audioMode, retryKey, loadEpisode])

  useEffect(() => {
    activeProviderRef.current = activeProvider
  }, [activeProvider])

  useEffect(() => {
    if (!anime?.relations?.length) return
    let cancelled = false
    setMangaLoading(true)
    findMangaForAnime(anime.relations, anime.title)
      .then((m) => { if (!cancelled) setLinkedManga(m) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMangaLoading(false) })
    return () => { cancelled = true }
  }, [anime?.relations, anime?.title])

  // Season-finale: fetch the adaptation (which manga chapter to read next) so
  // the "caught up" card shows the resolver's grounded answer instead of a raw
  // latest-chapter number. getAdaptation sends the auth token when signed in;
  // a null result simply leaves the card without a chapter line.
  useEffect(() => {
    const isFinale = totalEpisodes > 0 && currentEp >= totalEpisodes
    if (!isFinale || !animeId) return
    let cancelled = false
    setAdaptation(null)
    getAdaptation(animeId, currentEp)
      .then((res) => {
        if (cancelled) return
        if (res?.nextChapter) {
          console.log('[VideoPlayer] adaptation resolved:', { animeId, episode: currentEp, nextChapter: res.nextChapter, volume: res.volume, source: res.source })
          setAdaptation(res)
        } else {
          console.log('[VideoPlayer] adaptation unavailable for', { animeId, episode: currentEp })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [animeId, currentEp, totalEpisodes])

  async function switchProvider(providerId) {
    if (!animeId || providerId === activeProvider) return
    // A manual switch supersedes any in-flight load; its own request id wins.
    const reqId = ++loadRequestRef.current
    const prevProvider = activeProvider
    setProviderError(null)
    setLoading(true)
    setStreamData(null)
    const video = videoRef.current
    // Preserve the current position across the switch so a provider change does
    // not restart the episode (unless the user seeks back to 0 themselves).
    resumeTargetRef.current = video && video.duration > 0 && video.currentTime > 2
      ? video.currentTime
      : null
    try {
      const result = await resolveStream(animeId, currentEp, audioMode, providerId)
      if (loadRequestRef.current !== reqId) return
      setStreamKey((k) => k + 1)
      setCdnHeaders(result.cdnHeaders || {})
      setActiveProvider(result.provider)
      activeProviderRef.current = result.provider
      setProviders(result.providers || [])
      setCheckingProvider(true)
      const { promise } = armVerification()
      setStreamData(result)
      const ok = await promise
      setCheckingProvider(false)
      if (loadRequestRef.current !== reqId) return
      if (ok) {
        console.log('[VideoPlayer] Manual switch verified via', result.provider)
        savePreferredProvider(animeId, audioMode, result.provider)
        resumeTargetRef.current = null
        if (!cwAddedRef.current) {
          cwAddedRef.current = true
          addContinueWatching(animeId, currentEp, anime?.title || '', anime?.coverImage || '', totalEpisodes, audioMode, result.provider)
        }
        setLoading(false)
      } else {
        setStreamData(null)
        setLoading(false)
        setProviderError(`${result.provider} did not start playing. Restoring ${prevProvider}.`)
        setActiveProvider(prevProvider)
        activeProviderRef.current = prevProvider
        loadEpisodeRef.current({ resume: resumeTargetRef.current })
      }
    } catch (err) {
      if (loadRequestRef.current !== reqId) return
      setStreamData(null)
      setLoading(false)
      setProviderError(err.message || `Failed to load from ${providerId}`)
      setActiveProvider(prevProvider)
      activeProviderRef.current = prevProvider
    }
  }

  function handleSkipChapter(type) {
    const video = videoRef.current
    if (!video || !streamData?.chapters?.length) return
    const chapter = streamData.chapters.find(ch =>
      type === 'intro' ? /intro/i.test(ch.title) : /outro|ed\b|ending/i.test(ch.title)
    )
    if (chapter) {
      video.currentTime = chapter.end + 0.5
      if (type === 'intro') setIntroSkipped(true)
      else setOutroSkipped(true)
    }
  }

  const introChapter = streamData?.chapters?.find(ch => /intro/i.test(ch.title))
  const outroChapter = streamData?.chapters?.find(ch => /outro|ed\b|ending/i.test(ch.title))

  const showIntroSkip = introChapter && !introSkipped && currentTime >= introChapter.start - 2 && currentTime <= introChapter.end + 2
  const showOutroSkip = outroChapter && !outroSkipped && currentTime >= outroChapter.start - 2 && currentTime <= outroChapter.end + 2

  const formatTime = (s) => {
    if (!s || !isFinite(s)) return '0:00'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch((err) => {
        // A blocked play (e.g. NotAllowedError) must never leave the player in
        // a stuck state: keep the center Play button interactive and let the
        // user retry with an actual click.
        console.warn('[VideoPlayer] play() rejected:', err?.name, err?.message)
        if (err?.name === 'NotAllowedError') {
          setShowControls(true)
        }
      })
    } else {
      video.pause()
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const handleVolumeChange = (e) => {
    const video = videoRef.current
    if (!video) return
    const v = Number(e.target.value)
    video.volume = v
    video.muted = v === 0
    setVolume(v)
    setMuted(v === 0)
  }

  const seek = (seconds) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds))
  }

  const handleSeek = (e) => {
    const video = videoRef.current
    if (!video || !video.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    video.currentTime = pct * video.duration
  }

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen()
    }
  }

  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    setCursorHidden(false)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (settingsOpenRef.current) return
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false)
        if (!isCoarsePointer) setCursorHidden(true)
      }
    }, 3000)
  }, [isCoarsePointer])

  // Keep the cursor visible whenever the video is not playing (initial load,
  // user pause, episode ended).
  useEffect(() => {
    if (!playing) setCursorHidden(false)
  }, [playing])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setPlaying(true)
    const onPause = () => { setPlaying(false); setShowControls(true) }
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (autoSkip && streamData?.chapters?.length) {
        const intro = streamData.chapters.find(ch => /intro/i.test(ch.title))
        const outro = streamData.chapters.find(ch => /outro|ed\b|ending/i.test(ch.title))
        if (intro && !introSkipped && video.currentTime >= Math.max(0, intro.start) - 0.5 && video.currentTime < intro.end) {
          video.currentTime = intro.end + 0.5
          setIntroSkipped(true)
          return
        }
        if (outro && !outroSkipped && video.currentTime >= Math.max(0, outro.start) - 0.5 && video.currentTime < outro.end) {
          video.currentTime = outro.end + 0.5
          setOutroSkipped(true)
          return
        }
      }
      if (!streamData?.chapters?.length) return
      const intro = streamData.chapters.find(ch => /intro/i.test(ch.title))
      const outro = streamData.chapters.find(ch => /outro|ed\b|ending/i.test(ch.title))
      if (intro && video.currentTime > intro.end + 0.5) setIntroSkipped(true)
      if (outro && video.currentTime > outro.end + 0.5) setOutroSkipped(true)
    }
    const onDurationChange = () => setDuration(video.duration)
    const onLoadedMetadata = () => setDuration(video.duration)
    const onEnded = () => {
      endedCountRef.current += 1
      console.log('[Episode Debug] ended #' + endedCountRef.current, 'ep', currentEp, hasNextEpisode ? '(has next)' : '(no next)')
      if (!hasNextEpisode) {
        setShowSeasonComplete(true)
        return
      }
      // The transition is driven by the REAL 'ended' event: only once the video
      // actually finishes do we arm the Up Next popup (and its countdown). No
      // timeupdate heuristic can pre-empt or re-trigger this.
      if (autoplayEnabled && !nextEpTriggeredRef.current && !transitionLockRef.current) {
        nextEpTriggeredRef.current = true
        console.log('[Episode Debug] ended: arming autoplay -> ep', currentEp + 1)
        setShowNextEpisode(true)
        setNextCountdown(5)
      }
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('ended', onEnded)
    setIntroSkipped(false)
    setOutroSkipped(false)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('ended', onEnded)
    }
  }, [streamData, hasNextEpisode, currentEp, totalEpisodes, autoSkip, introSkipped, outroSkipped, autoplayEnabled])

  useEffect(() => {
    nextEpTriggeredRef.current = false
    transitionLockRef.current = false
    setShowNextEpisode(false)
    setNextEpLoading(false)
    setShowSeasonComplete(false)
  }, [animeId, currentEp, audioMode])

  useEffect(() => {
    if (!showNextEpisode) {
      transitionLockRef.current = false
    }
  }, [showNextEpisode])

  const [nextCountdown, setNextCountdown] = useState(5)

  // The full ordered episode list. Prefers the provider's REAL episode numbers
  // (normalized + sorted server-side); falls back to sequential 1..N. The next
  // episode is always resolved from this list by index, never by adding 1 to
  // the current number, so a non-sequential/odd episode mapping can never cause
  // a skip.
  const allEpisodes = useMemo(
    () => buildEpisodeList(totalEpisodes, currentEp, streamData?.episodeList),
    [totalEpisodes, currentEp, streamData]
  )

  // Single next-episode transition shared by the countdown (reaching 0), the
  // real 'ended' event arming, and the Watch Now button. `tryArm` (shared with
  // the TV player) is single-flight per (animeId, episode): duplicate triggers
  // collapse into one navigation — the historical double-skip bug.
  const startNextEpisodeTransition = useCallback(() => {
    if (transitionLockRef.current) return
    const idx = allEpisodes.findIndex((e) => e === currentEp)
    const next = getNextEpisode(allEpisodes, currentEp)
    if (next == null) {
      console.log('[Episode Debug] transition: no next episode (totalEpisodes', totalEpisodes, ')')
      setNextEpLoading(false)
      setShowNextEpisode(false)
      setShowSeasonComplete(true)
      return
    }
    if (!tryArm(animeId, currentEp)) {
      console.log('[Episode Debug] transition already armed for', animeId, 'ep', currentEp)
      return
    }
    transitionLockRef.current = true
    setNextEpLoading(true)
    console.log('[Episode Debug] transition: ep', currentEp, '(index', idx, ') -> ep', next, '(index', idx + 1, ')')
    navigate(`/watch/${animeId}/${next}?total=${totalEpisodes}&audio=${audioMode}`)
  }, [allEpisodes, currentEp, animeId, totalEpisodes, audioMode, navigate])

  // A manual jump (Next/Prev/episode list) supersedes any pending autoplay: it
  // cancels the overlay and locks the transition so the old countdown can never
  // fire afterwards.
  const cancelAutoPlay = useCallback(() => {
    nextEpTriggeredRef.current = true
    transitionLockRef.current = true
    cancelProgression(animeId, currentEp)
    setShowNextEpisode(false)
  }, [animeId, currentEp])

  useEffect(() => {
    if (!showNextEpisode || nextEpLoading || transitionLockRef.current) return
    if (nextCountdown <= 0) {
      startNextEpisodeTransition()
      return
    }
    // Deliberately NOT gated on `playing`: when a video ends some browsers also
    // fire `pause` (making `playing` false), which used to freeze the countdown
    // while the overlay's own visual countdown kept ticking to 0 — nothing
    // navigated. The countdown runs to 0 no matter what and hands off to the
    // single transition path.
    const timer = setTimeout(() => setNextCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [showNextEpisode, nextCountdown, nextEpLoading, startNextEpisodeTransition])

  useEffect(() => {
    if (showNextEpisode) setNextCountdown(5)
  }, [showNextEpisode])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const video = videoRef.current
      if (!video) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault(); togglePlay(); break
        case 'ArrowLeft':
          e.preventDefault(); seek(-10); resetControlsTimer(); break
        case 'ArrowRight':
          e.preventDefault(); seek(10); resetControlsTimer(); break
        case 'f':
          e.preventDefault(); toggleFullscreen(); break
        case 'm':
          e.preventDefault(); toggleMute(); break
        case 'ArrowUp':
          e.preventDefault(); handleVolumeChange({ target: { value: Math.min(1, video.volume + 0.1) } }); resetControlsTimer(); break
        case 'ArrowDown':
          e.preventDefault(); handleVolumeChange({ target: { value: Math.max(0, volume - 0.1) } }); resetControlsTimer(); break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [volume, streamData])

  // Unified loading overlay: "Switching stream…" while the player is changing
  // providers, "Buffering…" while an established provider waits on data. Hidden
  // once playback settles into an error state (no stream + not loading).
  const indicatorVisible = (checkingProvider || buffering) && (streamData || loading)
  const indicatorLabel = checkingProvider ? 'Switching stream…' : 'Buffering…'

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="relative w-full bg-gray-900">
        <div
          ref={containerRef}
          className={`w-full aspect-video relative group ${cursorHidden ? 'cursor-none' : ''}`}
          onMouseMove={resetControlsTimer}
          onMouseLeave={() => { if (playing) setShowControls(false); setCursorHidden(false) }}
        >
          {streamData ? (
            <>
              <video
                ref={videoRef}
                key={streamKey}
                className={`w-full h-full bg-black ${cursorHidden ? 'cursor-none' : 'cursor-pointer'}`}
                playsInline
                onClick={togglePlay}
              />
              <div
                className={`absolute inset-0 pointer-events-none transition-opacity duration-300 flex items-center justify-center ${
                  !playing && showControls && !indicatorVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <button
                  onClick={togglePlay}
                  className="pointer-events-auto w-[74px] h-[74px] rounded-full flex items-center justify-center transition-transform duration-200 hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(13,19,32,0.55)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 0 0 1px rgba(34,211,238,0.15), 0 12px 44px rgba(0,0,0,0.55)',
                  }}
                >
                  <span
                    className="w-full h-full rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.22), rgba(124,58,237,0.3))' }}
                  >
                    <Play className="w-9 h-9 text-white ml-1" />
                  </span>
                </button>
              </div>
              <div
                className={`absolute bottom-0 left-0 right-0 kx-player-grad transition-opacity duration-300 pointer-events-none ${
                  showControls ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <div className="px-4 sm:px-6 pb-4 pt-16 pointer-events-auto">
                  <div
                    className="w-full h-[5px] bg-white/15 rounded-full cursor-pointer group/seek hover:h-[9px] transition-all mb-3.5"
                    onClick={handleSeek}
                  >
                    <div
                      className="h-full rounded-full relative kx-seek-fill"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" style={{ boxShadow: '0 0 10px rgba(34,211,238,0.8)' }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-1 min-h-[2rem]">
                    <div className="flex items-center gap-2">
                      {showIntroSkip && (
                        <button
                          onClick={() => handleSkipChapter('intro')}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white text-xs font-semibold rounded-md transition-all duration-200 backdrop-blur-sm"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                          Skip Intro
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {showOutroSkip && (
                        <button
                          onClick={() => handleSkipChapter('outro')}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white text-xs font-semibold rounded-md transition-all duration-200 backdrop-blur-sm"
                        >
                          Skip Outro
                          <SkipForward className="w-3.5 h-3.5" style={{ transform: 'scaleX(-1)' }} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={togglePlay}
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all hover:bg-white/10"
                      style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(124,58,237,0.24))', border: '1px solid rgba(34,211,238,0.25)' }}
                    >
                      {playing ? <Pause className="w-[22px] h-[22px] fill-current" /> : <Play className="w-[22px] h-[22px] fill-current ml-0.5" />}
                    </button>
                    <button onClick={() => seek(-10)} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors" title="Back 10s (←)">
                      <div className="relative">
                        <RotateCcw className="w-[18px] h-[18px]" />
                        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold">10</span>
                      </div>
                    </button>
                    <button onClick={() => seek(10)} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors" title="Forward 10s (→)">
                      <div className="relative">
                        <RotateCcw className="w-[18px] h-[18px]" style={{ transform: 'scaleX(-1)' }} />
                        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold">10</span>
                      </div>
                    </button>
                    <div className="relative" onMouseEnter={() => setShowVolume(true)} onMouseLeave={() => setShowVolume(false)}>
                      <button onClick={toggleMute} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                        {muted || volume === 0 ? <VolumeX className="w-[22px] h-[22px]" /> : <Volume2 className="w-[22px] h-[22px]" />}
                      </button>
                      <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 transition-all duration-200 ${
                        showVolume ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
                      }`}>
                        <div className="bg-kx-surface/95 backdrop-blur-xl border border-white/10 rounded-xl px-2 py-3 flex items-center justify-center shadow-2xl">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={muted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className="w-20 accent-cyan-glow cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 font-mono ml-1 tabular-nums">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    <div className="flex-1" />
                    <button onClick={toggleSettings} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors" title="Settings">
                      <Settings className="w-[22px] h-[22px]" />
                    </button>
                    <button onClick={toggleFullscreen} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                      {isFullscreen ? <Minimize className="w-[22px] h-[22px]" /> : <Maximize className="w-[22px] h-[22px]" />}
                    </button>
                  </div>
                </div>
              </div>

              {showSettings && (
                <div className="absolute bottom-24 right-2 w-64 bg-kx-surface/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl z-30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Settings</h3>
                    <button onClick={closeSettings} className="text-gray-400 hover:text-white text-sm p-0.5" aria-label="Close settings">
                      &#x2715;
                    </button>
                  </div>
                  <div className="p-4 space-y-5 max-h-[50vh] overflow-y-auto">
                    {qualityLevels.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">Quality</p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => handleQualityChange(-1)}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                              selectedLevel === -1
                                ? 'bg-primary text-white'
                                : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            Auto
                          </button>
                          {qualityLevels.map((l) => (
                            <button
                              key={l.index}
                              onClick={() => handleQualityChange(l.index)}
                              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                                selectedLevel === l.index
                                  ? 'bg-primary text-white'
                                  : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {qualityLabel(l.height)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Playback Speed</p>
                      <div className="flex flex-wrap gap-1.5">
                        {SPEED_OPTIONS.map((rate) => (
                          <button
                            key={rate}
                            onClick={() => handleSpeedChange(rate)}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                              playbackRate === rate
                                ? 'bg-primary text-white'
                                : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {rate === 1 ? '1x' : `${rate}x`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">Auto Skip</p>
                        <p className="text-xs text-gray-500 mt-0.5">Skip opening and ending chapters automatically</p>
                      </div>
                      <button
                        onClick={handleAutoSkipToggle}
                        aria-label="Toggle auto skip"
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                          autoSkip ? 'bg-primary' : 'bg-white/10'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                            autoSkip ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <NextEpisodeOverlay
                visible={showNextEpisode}
                nextEpisode={currentEp + 1}
                totalEpisodes={totalEpisodes}
                animeTitle={anime?.title || ''}
                countdown={nextCountdown}
                loading={nextEpLoading}
                onWatchNow={() => startNextEpisodeTransition()}
                onCancel={() => {
                  setShowNextEpisode(false)
                  nextEpTriggeredRef.current = false
                }}
              />

              {showSeasonComplete && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-40">
                  <div className="text-center px-6">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                      <Check className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Season Complete</h2>
                    <p className="text-gray-400 mb-6 max-w-sm">
                      You've reached the end of {anime?.title || 'this series'}. Check back for new episodes!
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Link
                        to={`/anime/${animeId}`}
                        className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition-colors text-sm"
                      >
                        View Details
                      </Link>
                      <Link
                        to="/home"
                        className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors text-sm"
                      >
                        Browse More
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center flex-col gap-4">
              {loading ? (
                <>
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-white">{anime?.title || 'Loading...'}</h2>
                    <p className="text-sm text-gray-400">
                      Episode {currentEp}
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        audioMode === 'sub' ? 'bg-blue-500/30 text-blue-300' : 'bg-orange-500/30 text-orange-300'
                      }`}>
                        {audioMode === 'sub' ? 'Sub' : 'Dub'}
                      </span>
                    </p>
                  </div>
                </>
              ) : streamError ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-white">{anime?.title || 'Unknown'}</h2>
                    <p className="text-sm text-red-400 mt-1">{streamError}</p>
                    <p className="text-xs text-gray-500 mt-2">Episode {currentEp} &middot; {audioMode.toUpperCase()}</p>
                    <button
                      onClick={() => { setStreamError(null); setLoading(true); setRetryKey(k => k + 1) }}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                    {audioMode === 'dub' && hasSub && (
                      <Link
                        to={`/watch/${animeId}/${currentEp}?total=${totalEpisodes}&audio=sub`}
                        onClick={() => setAudioMode('sub')}
                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Watch Sub instead
                      </Link>
                    )}
                    {audioMode === 'sub' && hasDub && (
                      <Link
                        to={`/watch/${animeId}/${currentEp}?total=${totalEpisodes}&audio=dub`}
                        onClick={() => setAudioMode('dub')}
                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Watch Dub instead
                      </Link>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* Buffering / provider-switching indicator */}
          <div
            className={`absolute inset-0 z-20 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
              indicatorVisible ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={!indicatorVisible}
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/25 px-7 py-5 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40">
              <span className="relative block h-10 w-10 md:h-12 md:w-12">
                <span className="absolute inset-0 rounded-full border-2 border-white/15" />
                <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin buffering-glow motion-reduce:animate-none" />
              </span>
              <p className="text-xs md:text-sm font-medium tracking-wide text-white/90">{indicatorLabel}</p>
            </div>
          </div>

        </div>
      </div>

      <div className="flex-1 bg-gray-950 p-4 sm:p-6">
        <div className="max-w-[1440px] mx-auto">
          {!hasSub && !hasDub && (
            <div className="mb-4 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
              <p className="text-sm text-yellow-300">This episode is not available yet.</p>
            </div>
          )}

          {!mangaLoading && linkedManga && totalEpisodes > 0 && currentEp >= totalEpisodes && (
            <div className="mb-4 animate-[fadeSlideUp_300ms_ease-out]">
              <Link
                to={`/manga/${linkedManga.mangaId}`}
                className="block group"
              >
                <div className="bg-[#161B2E] rounded-2xl border border-white/[0.08] shadow-xl shadow-black/30 overflow-hidden hover:border-purple-500/30 transition-all duration-300">
                  <div className="flex flex-col md:flex-row items-stretch">
                    <div className="w-full md:w-24 shrink-0">
                      <div className="aspect-[3/4] md:aspect-auto md:h-full">
                        {linkedManga.coverImage ? (
                          <img src={linkedManga.coverImage} alt={linkedManga.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                            <BookOpen className="w-6 h-6 text-gray-600" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 p-3 md:p-4 flex flex-col justify-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🎉</span>
                        <p className="text-sm font-semibold text-white">You're caught up with the anime!</p>
                      </div>
                      <p className="text-xs text-gray-400">The story continues in the manga.</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Last Anime Episode: <span className="text-white font-medium">{totalEpisodes}</span></span>
                        {(adaptation?.nextChapter || (linkedManga.latestChapter && Number(linkedManga.latestChapter) > 1)) && (
                          <span>
                            Continue from {adaptation?.volume ? `Volume ${adaptation.volume}, ` : ''}Chapter{' '}
                            <span className="text-purple-400 font-medium">#{adaptation?.nextChapter ?? linkedManga.latestChapter}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-purple-600/25">
                          <BookOpen className="w-3.5 h-3.5" /> Continue Reading
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative group/sub">
              {!hasSub && <div className="absolute inset-0 z-10 cursor-not-allowed rounded-lg" />}
              <Link
                to={hasSub ? `/watch/${animeId}/${currentEp}?total=${totalEpisodes}&audio=sub` : undefined}
                onClick={() => hasSub && setAudioMode('sub')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all relative z-0 ${
                  !hasSub
                    ? 'bg-white/5 text-gray-600 opacity-50'
                    : audioMode === 'sub'
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Sub
              </Link>
              {!hasSub && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/sub:opacity-100 pointer-events-none transition-opacity shadow-lg border border-white/10 z-50">
                  Japanese subtitles are not available yet.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-white/10" />
                </div>
              )}
            </div>
            <div className="relative group/dub">
              {!hasDub && <div className="absolute inset-0 z-10 cursor-not-allowed rounded-lg" />}
              <Link
                to={hasDub ? `/watch/${animeId}/${currentEp}?total=${totalEpisodes}&audio=dub` : undefined}
                onClick={() => hasDub && setAudioMode('dub')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all relative z-0 ${
                  !hasDub
                    ? 'bg-white/5 text-gray-600 opacity-50'
                    : audioMode === 'dub'
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Dub
              </Link>
              {!hasDub && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/dub:opacity-100 pointer-events-none transition-opacity shadow-lg border border-white/10 z-50">
                  English dub is not available yet.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-white/10" />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <Link
              to={animeId ? `/anime/${animeId}` : '/'}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-white truncate">{anime?.title || 'Loading...'}</h1>
              <p className="text-sm text-gray-400">
                Episode {currentEp} of {totalEpisodes || '?'}
                {activeProvider && (
                  <span className="ml-2 text-xs text-gray-500">via {activeProvider}</span>
                )}
              </p>
            </div>
            <button
              onClick={() => setShowEpisodeList(!showEpisodeList)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <List className="w-5 h-5 text-white" />
            </button>
          </div>

          {providerError && (
            <div className="mb-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm">
              {providerError}
            </div>
          )}

          {providers.length > 1 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Tv className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500 mr-1">Provider:</span>
              {providers.map(p => (
                <button
                  key={p.id}
                  onClick={() => switchProvider(p.id)}
                  className={`px-3 py-1 text-xs rounded-full transition-all ${
                    p.id === activeProvider
                      ? 'bg-primary text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                  title={p.tip}
                >
                  {p.id}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            {currentEp > 1 ? (
              <Link
                to={`/watch/${animeId}/${currentEp - 1}?total=${totalEpisodes}&audio=${audioMode}`}
                onClick={cancelAutoPlay}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition-colors text-sm"
              >
                <SkipBack className="w-4 h-4" /> Prev
              </Link>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 bg-white/5 text-gray-600 rounded-lg text-sm cursor-not-allowed">
                <SkipBack className="w-4 h-4" /> Prev
              </span>
            )}
            {hasNextEpisode ? (
              <Link
                to={`/watch/${animeId}/${currentEp + 1}?total=${totalEpisodes}&audio=${audioMode}`}
                onClick={cancelAutoPlay}
                className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary-light rounded-lg transition-colors text-sm"
              >
                Next <SkipForward className="w-4 h-4" />
              </Link>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 bg-white/5 text-gray-600 rounded-lg text-sm cursor-not-allowed">
                Next <SkipForward className="w-4 h-4" />
              </span>
            )}
          </div>

          {showEpisodeList && (
            <div className="mt-4 max-h-[50vh] rounded-xl border border-white/10 bg-gray-900/50 flex flex-col">
              <div className="p-3 border-b border-white/10 flex items-center gap-3 shrink-0">
                <h3 className="font-semibold text-white text-sm whitespace-nowrap">Episodes</h3>
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                  <input
                    ref={episodeSearchRef}
                    type="text"
                    value={episodeSearch}
                    onChange={(e) => setEpisodeSearch(e.target.value)}
                    placeholder="Search episodes..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-primary/50 focus:bg-white/[0.07] transition-all"
                  />
                </div>
                <button onClick={() => setShowEpisodeList(false)} className="text-gray-400 hover:text-white text-sm shrink-0 p-1">
                  &#x2715;
                </button>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0">
                {totalEpisodes > 0 ? (() => {
                  const allEps = Array.from({ length: totalEpisodes }, (_, i) => i + 1)
                  const q = episodeSearch.trim().toLowerCase()
                  const filtered = q
                    ? allEps.filter(ep => String(ep).includes(q) || `episode ${ep}`.includes(q))
                    : allEps
                  if (filtered.length === 0) {
                    return <p className="text-gray-500 text-sm p-6 text-center">No episodes found.</p>
                  }
                  return filtered.map((ep) => (
                    <Link
                      key={ep}
                      to={`/watch/${animeId}/${ep}?total=${totalEpisodes}&audio=${audioMode}`}
                      onClick={cancelAutoPlay}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-white/5 transition-colors ${
                        ep === currentEp ? 'bg-primary/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="text-xs font-mono text-gray-500 w-6 text-right">{ep}.</span>
                      <p className={`text-sm truncate flex-1 ${ep === currentEp ? 'text-primary-light font-medium' : 'text-gray-300'}`}>
                        Episode {ep}
                      </p>
                      {ep === currentEp ? (
                        <Pause className="w-3.5 h-3.5 text-primary-light shrink-0" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      )}
                    </Link>
                  ))
                })() : (
                  <p className="text-gray-500 text-sm p-6 text-center">No episodes</p>
                )}
              </div>
            </div>
          )}

              <CommentSection animeId={animeId} episode={currentEp} animeTitle={anime?.title || ''} animeCover={anime?.coverImage || ''} />
        </div>
      </div>
    </div>
  )
}
