import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { ChevronLeft, Play, Pause, List, SkipForward, SkipBack, AlertCircle, Loader2, RefreshCw, Tv, Volume2, VolumeX, RotateCcw, Maximize, Minimize, Search, Check, BookOpen } from 'lucide-react'
import { fetchMediaById } from '../api/anilist'
import { resolveStream, getServers, getSources, fetchEpisodeAvailability } from '../api/anikoto'
import { useAuth } from '../context/AuthContext'
import CommentSection from '../components/CommentSection'
import NextEpisodeOverlay from '../components/ui/NextEpisodeOverlay'
import { findMangaForAnime } from '../api/crosslink'

function encodeHeaders(headers) {
  return btoa(JSON.stringify(headers)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function proxyUrl(url, cdnHeaders) {
  return `/api/media/proxy?url=${encodeURIComponent(url)}&h=${encodeHeaders(cdnHeaders || {})}`
}

export default function VideoPlayer() {
  const { animeId, episode } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const audioMode = searchParams.get('audio') || 'sub'
  const currentEp = Number(episode) || 1
  const [totalEpisodes, setTotalEpisodes] = useState(() => Number(searchParams.get('total')) || 0)

  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  const [anime, setAnime] = useState(null)
  const [streamData, setStreamData] = useState(null)
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
  const { user, addContinueWatching, updateContinueWatchingProgress, removeContinueWatching, addWatchMinutes } = useAuth()

  const [showNextEpisode, setShowNextEpisode] = useState(false)
  const [nextEpLoading, setNextEpLoading] = useState(false)
  const [showSeasonComplete, setShowSeasonComplete] = useState(false)
  const nextEpTriggeredRef = useRef(false)
  const hasNavigatedRef = useRef(false)
  const watchStartRef = useRef(Date.now())
  const lastSaveRef = useRef(0)
  const resumeSetRef = useRef(false)
  const cwRef = useRef(user?.continueWatching || [])
  const saveProgressRef = useRef(null)
  const [linkedManga, setLinkedManga] = useState(null)
  const [mangaLoading, setMangaLoading] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [introSkipped, setIntroSkipped] = useState(false)
  const [outroSkipped, setOutroSkipped] = useState(false)
  const [episodeSearch, setEpisodeSearch] = useState('')
  const containerRef = useRef(null)
  const episodeSearchRef = useRef(null)
  const controlsTimeoutRef = useRef(null)

  const hasNextEpisode = totalEpisodes > 0 && currentEp < totalEpisodes

  const autoplayEnabled = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('appSettings') || '{}')
      return s.autoplay !== false
    } catch { return true }
  })()

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

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr, reqUrl) => {
          if (reqUrl.startsWith('/api/media/proxy')) return
          xhr.open('GET', proxyUrl(reqUrl, cdnHeaders), true)
        },
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const cw = cwRef.current.find(
          (e) => e.animeId === String(animeId) && e.episode === Number(currentEp)
        )
        if (cw && cw.currentTime > 5 && cw.duration > 0 && !resumeSetRef.current) {
          resumeSetRef.current = true
          video.currentTime = cw.currentTime
        }
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[HLS] Fatal error:', data.type, data.details)
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
          } else {
            setStreamError('Video playback error. Try another provider.')
          }
        }
      })

      if (streamData.tracks?.length) {
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
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [streamData, cdnHeaders, retryKey])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const doSave = () => {
      if (!video.duration || video.duration <= 0 || !isFinite(video.duration)) return
      if (video.currentTime < 30) return
      if (video.currentTime >= video.duration * 0.95) {
        removeContinueWatching(animeId)
        return
      }
      updateContinueWatchingProgress(animeId, currentEp, video.currentTime, video.duration)
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

  useEffect(() => {
    if (!animeId) return
    let cancelled = false
    setLoading(true)
    setStreamError(null)
    setStreamData(null)
    setProviders([])
    setActiveProvider(null)
    setProviderError(null)
    setCdnHeaders({})
    resumeSetRef.current = false

    fetchMediaById(animeId)
      .then(async (data) => {
        if (cancelled) return
        setAnime(data)
        if (data.episodes && !totalEpisodes) setTotalEpisodes(data.episodes)

        addContinueWatching(animeId, currentEp, data.title, data.coverImage, data.episodes || totalEpisodes, audioMode)

        console.log('[VideoPlayer] Resolving stream:', data.title, 'ep', currentEp, audioMode)
        try {
          const result = await resolveStream(animeId, currentEp, audioMode)
          if (cancelled) return
          console.log('[VideoPlayer] Stream resolved via', result.provider, ':', result.url.substring(0, 80))
          setStreamData(result)
          setActiveProvider(result.provider)
          setProviders(result.providers || [])
          setCdnHeaders(result.cdnHeaders || {})
          if (result.totalEpisodes && result.totalEpisodes > totalEpisodes) setTotalEpisodes(result.totalEpisodes)
          if (result.hasSub != null) setHasSub(result.hasSub)
          if (result.hasDub != null) setHasDub(result.hasDub)
          setLoading(false)
        } catch (err) {
          if (cancelled) return
          console.error('[VideoPlayer] Resolve error:', err)
          setStreamError(err.message || 'Stream not available')
          setLoading(false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[VideoPlayer] Media fetch error:', err)
        setStreamError('Failed to load anime data')
        setLoading(false)
      })

    return () => {
      cancelled = true
      const elapsed = (Date.now() - watchStartRef.current) / 60000
      if (elapsed > 0.5) addWatchMinutes(Math.round(elapsed))
    }
  }, [animeId, currentEp, audioMode, retryKey])

  useEffect(() => {
    if (hasSub && hasDub) return
    if (audioMode === 'sub' && !hasSub && hasDub) {
      navigate(`/watch/${animeId}/${currentEp}?total=${totalEpisodes}&audio=dub`, { replace: true })
    } else if (audioMode === 'dub' && !hasDub && hasSub) {
      navigate(`/watch/${animeId}/${currentEp}?total=${totalEpisodes}&audio=sub`, { replace: true })
    }
  }, [hasSub, hasDub, audioMode, animeId, currentEp, totalEpisodes, navigate])

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

  async function switchProvider(providerId) {
    if (!streamData?.slug || providerId === activeProvider) return
    setProviderError(null)
    setLoading(true)
    setStreamData(null)
    try {
      const result = await getSources(streamData.slug, currentEp, audioMode, providerId)
      if (result.sources?.length) {
        const sourceUrl = result.sources[0].url
        const newHeaders = result.headers || {}
        setStreamData({
          url: sourceUrl,
          cdnHeaders: newHeaders,
          provider: providerId,
          providers,
          tracks: result.tracks || [],
          chapters: result.chapters || [],
          episodeTitle: anime?.title || `Episode ${currentEp}`,
          totalEpisodes,
          slug: streamData.slug,
        })
        setActiveProvider(providerId)
        setCdnHeaders(newHeaders)
      } else {
        setProviderError(`Provider ${providerId} returned no sources`)
      }
      setLoading(false)
    } catch (err) {
      console.error('[VideoPlayer] Provider switch error:', err)
      setProviderError(`Failed to load from ${providerId}`)
      setLoading(false)
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
    video.paused ? video.play() : video.pause()
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
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false)
      }
    }, 3000)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setPlaying(true)
    const onPause = () => { setPlaying(false); setShowControls(true) }
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (autoplayEnabled && hasNextEpisode && !showNextEpisode && !nextEpTriggeredRef.current) {
        const remaining = video.duration - video.currentTime
        if (remaining <= 20 && remaining > 0) {
          nextEpTriggeredRef.current = true
          setShowNextEpisode(true)
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
      if (!hasNextEpisode) {
        setShowSeasonComplete(true)
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
  }, [streamData, hasNextEpisode, currentEp, totalEpisodes])

  useEffect(() => {
    nextEpTriggeredRef.current = false
    setShowNextEpisode(false)
    setNextEpLoading(false)
    setShowSeasonComplete(false)
  }, [animeId, currentEp, audioMode])

  useEffect(() => {
    if (!showNextEpisode) {
      hasNavigatedRef.current = false
    }
  }, [showNextEpisode])

  const [nextCountdown, setNextCountdown] = useState(5)

  const goToNextEpisode = useCallback(() => {
    if (hasNavigatedRef.current) return
    hasNavigatedRef.current = true
    navigate(`/watch/${animeId}/${currentEp + 1}?total=${totalEpisodes}&audio=${audioMode}`)
  }, [animeId, currentEp, totalEpisodes, audioMode, navigate])

  useEffect(() => {
    if (!showNextEpisode || nextEpLoading || hasNavigatedRef.current) return
    if (nextCountdown <= 0) {
      goToNextEpisode()
      return
    }
    if (!playing) return
    const timer = setTimeout(() => setNextCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [showNextEpisode, nextCountdown, playing, nextEpLoading, goToNextEpisode])

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

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="relative w-full bg-gray-900">
        <div
          ref={containerRef}
          className="w-full aspect-video relative group"
          onMouseMove={resetControlsTimer}
          onMouseLeave={() => { if (playing) setShowControls(false) }}
        >
          {streamData ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full bg-black cursor-pointer"
                playsInline
                onClick={togglePlay}
              />
              <div
                className={`absolute inset-0 pointer-events-none transition-opacity duration-300 flex items-center justify-center ${
                  !playing && showControls ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <button
                  onClick={togglePlay}
                  className="pointer-events-auto w-16 h-16 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                >
                  <Play className="w-8 h-8 text-white ml-1" />
                </button>
              </div>
              <div
                className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 pointer-events-none ${
                  showControls ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <div className="px-4 pb-3 pt-12 pointer-events-auto">
                  <div
                    className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer group/seek hover:h-2.5 transition-all mb-3"
                    onClick={handleSeek}
                  >
                    <div
                      className="h-full bg-primary rounded-full relative"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
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
                  <div className="flex items-center gap-2">
                    <button onClick={togglePlay} className="p-1 text-white hover:text-primary transition-colors">
                      {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button onClick={() => seek(-10)} className="p-1 text-white/60 hover:text-white transition-colors" title="Back 10s (←)">
                      <div className="relative">
                        <RotateCcw className="w-4 h-4" />
                        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white/80">10</span>
                      </div>
                    </button>
                    <button onClick={() => seek(10)} className="p-1 text-white/60 hover:text-white transition-colors" title="Forward 10s (→)">
                      <div className="relative">
                        <RotateCcw className="w-4 h-4" style={{ transform: 'scaleX(-1)' }} />
                        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white/80">10</span>
                      </div>
                    </button>
                    <div className="relative" onMouseEnter={() => setShowVolume(true)} onMouseLeave={() => setShowVolume(false)}>
                      <button onClick={toggleMute} className="p-1 text-white/60 hover:text-white transition-colors">
                        {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                      <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 transition-all duration-200 ${
                        showVolume ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
                      }`}>
                        <div className="bg-gray-900/95 rounded-lg px-2 py-3 flex items-center justify-center">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={muted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className="w-20 accent-primary cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-300 font-mono ml-1">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    <div className="flex-1" />
                    <button onClick={toggleFullscreen} className="p-1 text-white/60 hover:text-white transition-colors">
                      {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <NextEpisodeOverlay
                visible={showNextEpisode}
                nextEpisode={currentEp + 1}
                totalEpisodes={totalEpisodes}
                animeTitle={anime?.title || ''}
                countdown={nextCountdown}
                loading={nextEpLoading}
                onWatchNow={() => {
                  setNextEpLoading(true)
                  goToNextEpisode()
                }}
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
                  </div>
                </>
              ) : null}
            </div>
          )}

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
                        {linkedManga.latestChapter && (
                          <span>Continue from Manga Chapter: <span className="text-purple-400 font-medium">#{linkedManga.latestChapter}</span></span>
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
