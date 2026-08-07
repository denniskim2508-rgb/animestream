import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Settings, Play } from 'lucide-react'
import { getChapterPages, getMangaChapters, getMangaDetails } from '../api/manga'
import { findAnimeForManga } from '../api/crosslink'
import { useAuth } from '../context/AuthContext'
import ReaderSettingsPanel from '../components/ReaderSettingsPanel'
import {
  DEFAULT_READER_SETTINGS,
  loadReaderSettings,
  saveReaderSettingsLocal,
  pushReaderSettingsRemote,
  mergeReaderSettings,
  loadLastPage,
  saveLastPage,
} from '../utils/readerSettings'

const THEME_BG = {
  dark: '#0a0a0a',
  oled: '#000000',
  light: '#e7e3da',
  sepia: '#e6dcc6',
}

const THEME_PAGE_BG = {
  dark: '#141414',
  oled: '#000000',
  light: '#ffffff',
  sepia: '#f5ead5',
}

function pageImgStyle(settings, isPaged, isContinuous) {
  const { zoom, freeZoom } = settings
  if (isContinuous) {
    return {
      width: zoom === 'free' ? `${freeZoom * 100}%` : '100%',
      maxWidth: zoom === 'free' ? 'none' : undefined,
    }
  }
  switch (zoom) {
    case 'fitHeight':
      return { height: '100vh', width: 'auto', maxHeight: 'none', maxWidth: 'none' }
    case 'original':
      return { width: 'auto', maxHeight: '92vh', maxWidth: 'none' }
    case 'free':
      return isPaged
        ? { width: `${Math.max(0.5, freeZoom) * 50}%`, maxWidth: 'none', maxHeight: 'none' }
        : { width: `${freeZoom * 100}%`, maxWidth: 'none', maxHeight: 'none' }
    default: // fitWidth
      return isPaged
        ? { maxWidth: '50%', maxHeight: '100vh', width: 'auto' }
        : { width: '100%', maxWidth: '48rem' }
  }
}

export default function MangaReader() {
  const { id, chapterId: rawChapterId } = useParams()
  // Some providers (mangapill) embed the full path slug in the chapter id, so
  // it must be URL-encoded in the route. React Router decodes params already,
  // but guard against a still-encoded value from older links.
  let chapterId = rawChapterId
  try {
    chapterId = decodeURIComponent(chapterId || '')
  } catch {
    // keep raw value if it contains an invalid escape
  }
  const navigate = useNavigate()
  const { user } = useAuth()

  const [settings, setSettings] = useState(() => loadReaderSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pagesSd, setPagesSd] = useState([])
  const [pagesFull, setPagesFull] = useState([])
  const [useFullRes, setUseFullRes] = useState(false)
  const [erroredImages, setErroredImages] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [loadedImages, setLoadedImages] = useState(new Set())
  const [mangaTitle, setMangaTitle] = useState('')
  const [chapterNum, setChapterNum] = useState(null)
  const [allChapters, setAllChapters] = useState([])
  const [showUI, setShowUI] = useState(true)
  const [linkedAnime, setLinkedAnime] = useState(null)
  const [animeLoading, setAnimeLoading] = useState(false)
  const [tapZoom, setTapZoom] = useState(null)

  const containerRef = useRef(null)
  const scrollRef = useRef(null)
  const pageRefs = useRef([])
  const uiTimerRef = useRef(null)
  const rafRef = useRef(null)
  const navTimerRef = useRef(null)
  const remoteTimerRef = useRef(null)
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 })
  const rememberLastPageRef = useRef(settings.rememberLastPage)
  const hydratedRef = useRef(false)

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const isContinuous = ['longStrip', 'longStripGap', 'webtoon'].includes(settings.readingMode)
  const isPaged = settings.readingMode === 'pagedLtr' || settings.readingMode === 'pagedRtl'
  const rtlReading = settings.pageDirection === 'rtl'
  const step = isPaged ? 2 : 1

  // Pull signed-in user's saved settings from Firestore once auth is ready.
  useEffect(() => {
    if (user?.uid && user.readerSettings && typeof user.readerSettings === 'object') {
      setSettings((prev) => mergeReaderSettings(prev, user.readerSettings))
    }
  }, [user?.uid])

  // Persist locally immediately, and to Firestore (debounced) for signed-in users.
  useEffect(() => {
    saveReaderSettingsLocal(settings)
    if (user?.uid) {
      clearTimeout(remoteTimerRef.current)
      remoteTimerRef.current = setTimeout(() => {
        pushReaderSettingsRemote(user.uid, settings)
      }, 800)
    }
    return () => clearTimeout(remoteTimerRef.current)
  }, [settings, user?.uid])

  useEffect(() => {
    rememberLastPageRef.current = settings.rememberLastPage
  }, [settings.rememberLastPage])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCurrentPage(0)
    setLoadedImages(new Set())
    setErroredImages(new Set())
    setUseFullRes(false)
    setTapZoom(null)
    setSettingsOpen(false)
    pageRefs.current = []
    hydratedRef.current = false

    Promise.all([
      getChapterPages(chapterId, id),
      getMangaDetails(id).catch(() => null),
    ]).then(([pageData, manga]) => {
      if (cancelled) return
      setPagesSd(pageData.pagesSd || [])
      setPagesFull(pageData.pages || [])
      if (manga) setMangaTitle(manga.title)
      if (rememberLastPageRef.current) {
        const stored = loadLastPage(chapterId)
        if (stored != null) {
          const total = (pageData.pages?.length || 1)
          setCurrentPage(Math.max(0, Math.min(stored, total - 1)))
        }
      }
      hydratedRef.current = true
      console.log('[MangaReader] chapter loaded', {
        mangaId: id,
        chapterId,
        provider: pageData.provider,
        source: pageData.source,
        pages: pageData.pages?.length ?? 0,
        pagesSd: pageData.pagesSd?.length ?? 0,
        firstUrl: pageData.pages?.[0] ?? null,
      })
    }).catch((err) => {
      if (!cancelled) setError(err.message || 'Failed to load chapter')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    getMangaChapters(id, 'en', 500).then((res) => {
      if (!cancelled) {
        const sorted = res.data.sort((a, b) => (a.chapter || 0) - (b.chapter || 0))
        setAllChapters(sorted)
        const current = sorted.find((ch) => ch.id === chapterId)
        if (current) setChapterNum(current.chapter)
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [id, chapterId])

  useEffect(() => {
    if (!mangaTitle) return
    let cancelled = false
    setAnimeLoading(true)
    findAnimeForManga(mangaTitle)
      .then((a) => { if (!cancelled) setLinkedAnime(a) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnimeLoading(false) })
    return () => { cancelled = true }
  }, [mangaTitle])

  const currentIndex = allChapters.findIndex((ch) => ch.id === chapterId)
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null

  // Data-saver images are occasionally missing on MangaDex CDN nodes, so any
  // load failure drops the whole chapter back to full-resolution pages. Only
  // use data-saver when a real (non-empty) set exists.
  const canUseSd = pagesSd.length > 0 && pagesSd.length === pagesFull.length
  const useSdImages = settings.dataSaver && !settings.highQualityImages && !useFullRes && canUseSd
  const pages = useSdImages ? pagesSd : pagesFull
  const safePage = pages.length ? Math.min(currentPage, pages.length - 1) : 0
  const progressPct = pages.length ? ((safePage + 1) / pages.length) * 100 : 0

  const goToPage = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, idx))
    setCurrentPage(clamped)
    setTapZoom(null)
    if (isContinuous && scrollRef.current && pageRefs.current[clamped]) {
      const el = pageRefs.current[clamped]
      const target = el.getBoundingClientRect().top
        - scrollRef.current.getBoundingClientRect().top
        + scrollRef.current.scrollTop
      scrollRef.current.scrollTo({ top: target, behavior: 'smooth' })
    }
  }, [isContinuous, pages.length])

  const updatePageFromScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const center = el.getBoundingClientRect().top + el.clientHeight / 2
    let best = 0
    let bestDist = Infinity
    pageRefs.current.forEach((pageEl, i) => {
      if (!pageEl) return
      const r = pageEl.getBoundingClientRect()
      const dist = Math.abs(r.top + r.height / 2 - center)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    setCurrentPage(best)
  }, [])

  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      updatePageFromScroll()
    })
  }, [updatePageFromScroll])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      clearTimeout(navTimerRef.current)
    }
  }, [])

  const handleDoubleTap = useCallback((e) => {
    if (!settings.doubleTapToZoom || isContinuous || !isTouch) return
    const now = Date.now()
    const { time, x, y } = lastTapRef.current
    const rect = e.currentTarget?.getBoundingClientRect()
    const px = rect ? ((e.clientX - rect.left) / rect.width) * 100 : 50
    const py = rect ? ((e.clientY - rect.top) / rect.height) * 100 : 50
    if (now - time < 300 && Math.abs(e.clientX - x) < 30 && Math.abs(e.clientY - y) < 30) {
      clearTimeout(navTimerRef.current)
      setTapZoom((z) => (z ? null : { x: px, y: py }))
      lastTapRef.current = { time: 0, x: 0, y: 0 }
    } else {
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY }
    }
  }, [settings.doubleTapToZoom, isContinuous, isTouch])

  const handleClick = useCallback((e) => {
    if (settingsOpen) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const thirdW = rect.width / 3
    const thirdH = rect.height / 3
    let goNext = null
    if (settings.tapZones === 'horizontal' || settings.tapZones === 'both') {
      if (x < thirdW) goNext = false
      else if (x > rect.width - thirdW) goNext = true
    }
    if (goNext == null && (settings.tapZones === 'vertical' || settings.tapZones === 'both')) {
      if (y < thirdH) goNext = false
      else if (y > rect.height - thirdH) goNext = true
    }
    if (goNext == null) return
    const forward = rtlReading ? !goNext : goNext
    const target = currentPage + (forward ? step : -step)
    const clamped = Math.max(0, Math.min(pages.length - 1, target))
    if (clamped === currentPage) return
    if (settings.doubleTapToZoom && isTouch) {
      clearTimeout(navTimerRef.current)
      navTimerRef.current = setTimeout(() => goToPage(clamped), 280)
    } else {
      goToPage(clamped)
    }
  }, [settings.tapZones, rtlReading, currentPage, step, goToPage, pages.length, settingsOpen, settings.doubleTapToZoom, isTouch])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape') {
        setSettingsOpen(false)
        return
      }
      let dir = null
      if (e.key === 'ArrowLeft') dir = false
      else if (e.key === 'ArrowRight') dir = true
      else if (e.key === ' ') { e.preventDefault(); dir = true }
      if (dir == null) return
      const forward = rtlReading ? !dir : dir
      goToPage(currentPage + (forward ? step : -step))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [currentPage, goToPage, step, rtlReading])

  useEffect(() => {
    if (!settings.autoHideControls) {
      setShowUI(true)
      clearTimeout(uiTimerRef.current)
      return
    }
    const onActivity = () => {
      setShowUI(true)
      clearTimeout(uiTimerRef.current)
      uiTimerRef.current = setTimeout(() => setShowUI(false), 2500)
    }
    document.addEventListener('mousemove', onActivity)
    document.addEventListener('touchstart', onActivity)
    return () => {
      document.removeEventListener('mousemove', onActivity)
      document.removeEventListener('touchstart', onActivity)
      clearTimeout(uiTimerRef.current)
    }
  }, [settings.autoHideControls])

  useEffect(() => {
    if (!settings.keepScreenAwake) return
    let active = true
    let sentinel = null
    const request = async () => {
      if (!('wakeLock' in navigator) || sentinel) return
      try {
        sentinel = await navigator.wakeLock.request('screen')
        if (!active) sentinel.release()
      } catch { /* best-effort */ }
    }
    request()
    const onVisible = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      try { sentinel?.release?.() } catch { /* best-effort */ }
    }
  }, [settings.keepScreenAwake])

  useEffect(() => {
    if (!('orientation' in screen) || !screen.orientation?.lock) return
    const { orientation } = settings
    try {
      if (orientation === 'free') {
        screen.orientation.unlock()
        return
      }
      const want = orientation === 'portrait' || orientation === 'lockedPortrait' ? 'portrait' : 'landscape'
      const wantsLock = orientation === 'lockedPortrait' || orientation === 'lockedLandscape'
      if (wantsLock && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {})
      }
      screen.orientation.lock(want).catch(() => {})
    } catch { /* best-effort: orientation lock needs a secure, fullscreen context */ }
    return () => {
      try { screen.orientation.unlock() } catch { /* best-effort */ }
    }
  }, [settings.orientation])

  useEffect(() => {
    if (!settings.rememberLastPage || !hydratedRef.current) return
    saveLastPage(chapterId, currentPage)
  }, [settings.rememberLastPage, chapterId, currentPage])

  const handleImageLoad = useCallback((idx) => {
    setLoadedImages((prev) => new Set(prev).add(idx))
  }, [])

  const handleImageError = useCallback((idx) => {
    if (useSdImages) {
      setUseFullRes(true)
      return
    }
    setLoadedImages((prev) => new Set(prev).add(idx))
    setErroredImages((prev) => new Set(prev).add(idx))
  }, [useSdImages])

  const changeSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    if (key === 'readingMode' || key === 'zoom') setTapZoom(null)
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_READER_SETTINGS })
  }, [])

  let transform = ''
  if (settings.cropBorders) transform += 'scale(1.12) '
  if (tapZoom && !isContinuous) transform += 'scale(2)'

  const imgEffects = {
    ...(transform ? { transform, transformOrigin: tapZoom ? `${tapZoom.x}% ${tapZoom.y}%` : 'center', transition: 'transform 0.2s ease' } : {}),
    ...(settings.sharpenImages ? { filter: 'saturate(1.15) contrast(1.08)' } : {}),
    ...(tapZoom ? { cursor: 'zoom-out' } : {}),
  }

  const renderPage = (idx) => {
    const loaded = loadedImages.has(idx)
    const errored = erroredImages.has(idx)
    if (errored) {
      return (
        <div className="w-full py-32 flex items-center justify-center">
          <p className="text-gray-500 text-sm">This image could not be loaded.</p>
        </div>
      )
    }
    return (
      <div className={`relative ${settings.cropBorders ? 'overflow-hidden' : ''}`} style={{ backgroundColor: THEME_PAGE_BG[settings.theme] }}>
        {!loaded && (
          <div className="w-full py-32 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
        <img
          src={pages[idx]}
          alt={`Page ${idx + 1}`}
          className="h-auto"
          style={{ ...pageImgStyle(settings, isPaged, false), ...(loaded ? {} : { display: 'none' }), ...imgEffects }}
          onLoad={() => handleImageLoad(idx)}
          onError={() => handleImageError(idx)}
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading chapter...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate(`/manga/${id}`)}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm"
          >
            Back to Details
          </button>
        </div>
      </div>
    )
  }

  const spread = (() => {
    if (!isPaged) return [safePage]
    const base = Math.floor(safePage / 2) * 2
    const list = [base, base + 1].filter((i) => i < pages.length)
    return settings.readingMode === 'pagedRtl' ? [...list].reverse() : list
  })()

  return (
    <div className="min-h-screen bg-black">
      {settings.showReadingProgress && (
        <div className="fixed top-0 left-0 right-0 z-[60] h-1 bg-white/10">
          <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className={`fixed top-0 left-0 right-0 z-50 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-b from-black/90 to-transparent px-4 py-3 flex items-center gap-3">
          <Link to={`/manga/${id}`} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{mangaTitle || 'Manga'}</p>
            <p className="text-xs text-gray-400">Chapter {chapterNum || ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {settings.showPageNumber && (
              <span className="text-xs text-gray-400">
                {safePage + 1} / {pages.length}
              </span>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className={`p-1.5 rounded-lg transition-colors ${settingsOpen ? 'text-primary-light' : 'text-gray-400 hover:text-white'}`}
              title="Reader settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {!animeLoading && linkedAnime && (
        <div className="fixed top-14 left-0 right-0 z-40 px-4 animate-[fadeSlideUp_300ms_ease-out]">
          <div className="max-w-3xl mx-auto">
            <Link to={`/anime/${linkedAnime.anilistId}`} className="block group">
              <div className="bg-[#161B2E]/95 backdrop-blur-xl rounded-xl border border-white/[0.08] px-4 py-3 hover:border-primary/30 transition-all duration-300 shadow-xl shadow-black/30">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🎬</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-primary-light transition-colors truncate">
                      Prefer watching?
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      These chapters are available as anime episodes. Watch {linkedAnime.title} now.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg transition-all active:scale-95 shrink-0">
                    <Play className="w-3 h-3 fill-white" /> Watch
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      )}

      {isContinuous ? (
        <div
          ref={(el) => { scrollRef.current = el; containerRef.current = el }}
          onScroll={onScroll}
          onClick={handleClick}
          onTouchEnd={handleDoubleTap}
          style={{ backgroundColor: THEME_BG[settings.theme], height: '100dvh', overflowY: 'auto', overflowX: 'hidden' }}
          className="relative"
        >
          <div className={`mx-auto ${settings.readingMode === 'webtoon' ? 'max-w-md' : 'max-w-3xl'} ${settings.readingMode === 'longStripGap' ? 'space-y-5 py-4' : 'space-y-0'} pt-16 pb-28`}>
            {pages.map((url, idx) => (
              <div
                key={idx}
                ref={(el) => { pageRefs.current[idx] = el }}
                className={`flex justify-center ${settings.cropBorders ? 'overflow-hidden' : ''}`}
                style={{ backgroundColor: THEME_PAGE_BG[settings.theme] }}
              >
                <img
                  src={url}
                  alt={`Page ${idx + 1}`}
                  className="h-auto"
                  style={{ ...pageImgStyle(settings, false, true), ...imgEffects }}
                  onLoad={() => handleImageLoad(idx)}
                  onError={() => handleImageError(idx)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          onClick={handleClick}
          onTouchEnd={handleDoubleTap}
          className="min-h-screen flex items-center justify-center cursor-pointer overflow-x-auto"
          style={{ backgroundColor: THEME_BG[settings.theme] }}
        >
          {pages.length > 0 ? (
            isPaged ? (
              <div className="flex items-center justify-center gap-1 px-4 pt-16 pb-24">
                {spread.map((idx) => (
                  <div key={idx}>{renderPage(idx)}</div>
                ))}
              </div>
            ) : (
              <div className="w-full flex justify-center pt-16 pb-24">
                {renderPage(safePage)}
              </div>
            )
          ) : (
            <div className="text-center pt-24">
              <p className="text-gray-400 mb-4">No readable pages found for this chapter.</p>
              <Link to={`/manga/${id}`} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">
                Back to Details
              </Link>
            </div>
          )}
          {!isPaged && pages.slice(safePage + 1, safePage + 3).map((url, i) => (
            <img key={`preload-${safePage + 1 + i}`} src={url} alt="" className="hidden" />
          ))}
        </div>
      )}

      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-t from-black/90 to-transparent px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <button
              onClick={() => prevChapter && navigate(`/manga/${id}/read/${encodeURIComponent(prevChapter.id)}`)}
              disabled={!prevChapter}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(safePage - step)}
                disabled={safePage === 0}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {settings.showPageNumber && (
                <span className="text-sm text-gray-400 min-w-[80px] text-center">
                  {safePage + 1} / {pages.length}
                </span>
              )}
              <button
                onClick={() => goToPage(safePage + step)}
                disabled={safePage >= pages.length - 1}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => nextChapter && navigate(`/manga/${id}/read/${encodeURIComponent(nextChapter.id)}`)}
              disabled={!nextChapter}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <ReaderSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={changeSetting}
        onReset={resetSettings}
      />
    </div>
  )
}
