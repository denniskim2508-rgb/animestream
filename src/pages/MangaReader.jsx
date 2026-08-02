import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Loader2, BookOpen, Settings, ZoomIn, ZoomOut, RefreshCw, Tv, Film, Play } from 'lucide-react'
import { getChapterPages, getMangaChapters, getMangaDetails } from '../api/manga'
import { findAnimeForManga } from '../api/crosslink'

export default function MangaReader() {
  const { id, chapterId } = useParams()
  const navigate = useNavigate()
  const [pagesSd, setPagesSd] = useState([])
  const [pagesFull, setPagesFull] = useState([])
  const [useFullRes, setUseFullRes] = useState(false)
  const [erroredImages, setErroredImages] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [loadedImages, setLoadedImages] = useState(new Set())
  const [useDataSaver, setUseDataSaver] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mangaReaderSettings') || '{}').dataSaver !== false }
    catch { return true }
  })
  const [mangaTitle, setMangaTitle] = useState('')
  const [chapterNum, setChapterNum] = useState(null)
  const [allChapters, setAllChapters] = useState([])
  const containerRef = useRef(null)
  const [showUI, setShowUI] = useState(true)
  const [linkedAnime, setLinkedAnime] = useState(null)
  const [animeLoading, setAnimeLoading] = useState(false)
  const uiTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCurrentPage(0)
    setLoadedImages(new Set())
    setErroredImages(new Set())
    setUseFullRes(false)

    Promise.all([
      getChapterPages(chapterId),
      getMangaDetails(id).catch(() => null),
    ]).then(([pageData, manga]) => {
      if (cancelled) return
      setPagesSd(pageData.pagesSd || [])
      setPagesFull(pageData.pages || [])
      if (manga) setMangaTitle(manga.title)
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
  }, [id, chapterId, useDataSaver])

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
  const pages = useDataSaver && !useFullRes && canUseSd ? pagesSd : pagesFull

  const goToPage = useCallback((idx) => {
    setCurrentPage(Math.max(0, Math.min(pages.length - 1, idx)))
  }, [pages.length])

  const handleClick = useCallback((e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const third = rect.width / 3
    if (x < third) {
      goToPage(currentPage - 1)
    } else if (x > rect.width - third) {
      goToPage(currentPage + 1)
    }
  }, [currentPage, goToPage])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') goToPage(currentPage - 1)
      else if (e.key === 'ArrowRight') goToPage(currentPage + 1)
      else if (e.key === ' ') { e.preventDefault(); goToPage(currentPage + 1) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [currentPage, goToPage])

  useEffect(() => {
    const onMouse = () => {
      setShowUI(true)
      clearTimeout(uiTimerRef.current)
      uiTimerRef.current = setTimeout(() => setShowUI(false), 2500)
    }
    document.addEventListener('mousemove', onMouse)
    return () => {
      document.removeEventListener('mousemove', onMouse)
      clearTimeout(uiTimerRef.current)
    }
  }, [])

  const handleImageLoad = (idx) => {
    setLoadedImages((prev) => new Set(prev).add(idx))
  }

  const handleImageError = (idx) => {
    if (useDataSaver && !useFullRes) {
      setUseFullRes(true)
      return
    }
    setLoadedImages((prev) => new Set(prev).add(idx))
    setErroredImages((prev) => new Set(prev).add(idx))
  }

  const toggleDataSaver = () => {
    const next = !useDataSaver
    setUseDataSaver(next)
    localStorage.setItem('mangaReaderSettings', JSON.stringify({ dataSaver: next }))
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

  return (
    <div className="min-h-screen bg-black" ref={containerRef}>
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
            <span className="text-xs text-gray-400">
              {currentPage + 1} / {pages.length}
            </span>
            <button
              onClick={toggleDataSaver}
              className={`p-1.5 rounded-lg transition-colors ${useDataSaver ? 'text-primary-light' : 'text-gray-400 hover:text-white'}`}
              title="Toggle data saver"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {!animeLoading && linkedAnime && (
        <div className="fixed top-14 left-0 right-0 z-40 px-4 animate-[fadeSlideUp_300ms_ease-out]">
          <div className="max-w-3xl mx-auto">
            <Link
              to={`/anime/${linkedAnime.anilistId}`}
              className="block group"
            >
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

      <div className="min-h-screen flex items-center justify-center cursor-pointer" onClick={handleClick}>
        {pages.length > 0 ? (
          <div className="flex flex-col items-center w-full">
            {pages.slice(Math.max(0, currentPage - 1), currentPage + 4).map((url, offset) => {
              const idx = Math.max(0, currentPage - 1) + offset
              return (
                <div key={idx} className={`w-full flex justify-center ${idx === currentPage ? '' : 'hidden'}`}>
                  {erroredImages.has(idx) ? (
                    <div className="w-full py-32 flex items-center justify-center">
                      <p className="text-gray-500 text-sm">This image could not be loaded.</p>
                    </div>
                  ) : (
                    <>
                      {!loadedImages.has(idx) && (
                        <div className="w-full py-32 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        </div>
                      )}
                      <img
                        src={url}
                        alt={`Page ${idx + 1}`}
                        className="w-full max-w-3xl h-auto"
                        onLoad={() => handleImageLoad(idx)}
                        onError={() => handleImageError(idx)}
                        style={loadedImages.has(idx) ? {} : { display: 'none' }}
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No pages found.</p>
        )}
      </div>

      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-t from-black/90 to-transparent px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <button
              onClick={() => prevChapter && navigate(`/manga/${id}/read/${prevChapter.id}`)}
              disabled={!prevChapter}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 0}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400 min-w-[80px] text-center">
                {currentPage + 1} / {pages.length}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= pages.length - 1}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => nextChapter && navigate(`/manga/${id}/read/${nextChapter.id}`)}
              disabled={!nextChapter}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
