import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Clock, Calendar, User, Pen, Star, Eye, ChevronLeft, Play, Loader2, Tv, Film, ChevronRight } from 'lucide-react'
import { getMangaDetails, getMangaChapters, getAdaptation } from '../api/manga'
import { SkeletonPage } from '../components/ui/Skeleton'
import { findAnimeForManga } from '../api/crosslink'
import { useAuth } from '../context/AuthContext'

export default function MangaDetail() {
  const { id } = useParams()
  const [manga, setManga] = useState(null)
  const [chapters, setChapters] = useState([])
  const [chaptersTotal, setChaptersTotal] = useState(0)
  const [chaptersEnded, setChaptersEnded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chPage, setChPage] = useState(0)
  const [chLoading, setChLoading] = useState(false)
  const [linkedAnime, setLinkedAnime] = useState(null)
  const [animeLoading, setAnimeLoading] = useState(false)
  const [adaptation, setAdaptation] = useState(null)
  const [continueChapterId, setContinueChapterId] = useState(null)
  const [adaptationLoading, setAdaptationLoading] = useState(false)
  const { user } = useAuth()
  const perPage = 50

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setChPage(0)
    setChaptersTotal(0)
    setChaptersEnded(false)

    getMangaDetails(id)
      .then((data) => {
        if (!cancelled) {
          setManga(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load manga')
          setLoading(false)
        }
      })

    setAdaptation(null)
    setContinueChapterId(null)
    setAdaptationLoading(false)

    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    let cancelled = false
    setChLoading(true)
    getMangaChapters(id, 'en', perPage, chPage * perPage)
      .then((res) => {
        if (!cancelled) {
          setChapters((prev) => chPage === 0 ? res.data : [...prev, ...res.data])
          if (chPage === 0 && res.total > 0) setChaptersTotal(res.total)
          if (res.data.length < perPage) setChaptersEnded(true)
          setChLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setChLoading(false) })
    return () => { cancelled = true }
  }, [id, chPage])

  useEffect(() => {
    if (!manga?.title) return
    let cancelled = false
    setAnimeLoading(true)
    findAnimeForManga(manga.title)
      .then((a) => { if (!cancelled) setLinkedAnime(a) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnimeLoading(false) })
    return () => { cancelled = true }
  }, [manga?.title])

  const findChapterByNumber = useCallback(async (mangaId, chapterNum) => {
    const limit = 100
    let offset = 0
    while (true) {
      const res = await getMangaChapters(mangaId, 'en', limit, offset)
      const data = res.data || []
      if (!data.length) return null
      const hit = data.find((ch) => Number(ch.chapter) === chapterNum)
      if (hit) return hit
      if (data.length < limit) return null
      offset += limit
      if (res.total > 0 && offset >= res.total) return null
    }
  }, [])

  // Continue Reading: if the user has an anime adaptation in their watch
  // history, show where they should pick up in the manga.
  useEffect(() => {
    if (!manga?.title || !linkedAnime || animeLoading) return
    if (!user) {
      setAdaptation(null)
      setContinueChapterId(null)
      return
    }
    const candidates = linkedAnime.relatedAnime?.length
      ? linkedAnime.relatedAnime
      : [linkedAnime]
    const watched = (user.continueWatching || [])
      .filter((e) => candidates.some((c) => String(c.anilistId) === String(e.animeId)))
      .sort((a, b) => Number(b.episode) - Number(a.episode))[0]
    if (!watched) {
      setAdaptation(null)
      setContinueChapterId(null)
      return
    }

    let cancelled = false
    setAdaptationLoading(true)
    getAdaptation(watched.animeId, watched.episode)
      .then((res) => {
        if (cancelled || !res?.nextChapter) {
          if (!cancelled) setAdaptation(null)
          return
        }
        setAdaptation({ ...res, animeTitle: watched.title || res.animeTitle, watchedEpisode: watched.episode })
        return findChapterByNumber(id, res.nextChapter).then((ch) => {
          if (!cancelled) setContinueChapterId(ch?.id || null)
        })
      })
      .catch(() => { if (!cancelled) setAdaptation(null) })
      .finally(() => { if (!cancelled) setAdaptationLoading(false) })
    return () => { cancelled = true }
  }, [manga?.title, id, linkedAnime, animeLoading, user, findChapterByNumber])

  const loadMore = () => setChPage((p) => p + 1)

  const showLoadMore = chapters.length > 0 && !chaptersEnded && (
    chaptersTotal > 0 ? chapters.length < chaptersTotal : chapters.length % perPage === 0
  )

  if (loading) return <SkeletonPage />
  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-red-400">{error}</p>
    </div>
  )
  if (!manga) return null

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="relative">
        {manga.coverImage && (
          <div className="h-48 md:h-72 overflow-hidden">
            <img
              src={manga.coverImage.replace('.256.jpg', '.512.jpg')}
              alt=""
              className="w-full h-full object-cover object-top opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-8">
        <Link
          to="/manga"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Manga
        </Link>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="shrink-0">
            {manga.coverImage ? (
              <img
                src={manga.coverImage}
                alt={manga.title}
                className="w-36 md:w-56 rounded-xl shadow-2xl shadow-black/50"
                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(manga.title?.slice(0, 2) || '?')}&background=7c3aed&color=fff&size=200` }}
              />
            ) : (
              <div className="w-36 md:w-56 aspect-[3/4] rounded-xl bg-gray-800 flex items-center justify-center">
                <BookOpen className="w-12 h-12 text-gray-600" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-2">
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-3">{manga.title}</h1>

            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-4">
              {manga.author && (
                <span className="flex items-center gap-1.5">
                  <Pen className="w-3.5 h-3.5" /> {manga.author}
                </span>
              )}
              {manga.year && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> {manga.year}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                manga.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                manga.status === 'ongoing' ? 'bg-blue-500/20 text-blue-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {manga.status}
              </span>
              {manga.followedCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> {(manga.followedCount / 1000).toFixed(1)}k follows
                </span>
              )}
            </div>

            {manga.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {manga.tags.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-full bg-white/5 text-gray-300 text-[11px] font-medium border border-white/5">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {manga.description && (
              <div className="mb-6">
                <p className="text-sm text-gray-300 leading-relaxed line-clamp-4">{manga.description}</p>
              </div>
            )}
          </div>
        </div>

        {!adaptationLoading && adaptation && continueChapterId && (
          <section className="mt-8 animate-[fadeSlideUp_300ms_ease-out]">
            <Link
              to={`/manga/${id}/read/${encodeURIComponent(continueChapterId)}`}
              className="block group"
            >
              <div className="bg-[#161B2E] rounded-2xl border border-primary/30 shadow-xl shadow-black/30 p-5 md:p-6 hover:border-primary/60 transition-all duration-300 flex flex-col md:flex-row md:items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6 text-primary-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-primary-light font-semibold mb-1">Continue Reading</p>
                  <p className="text-sm md:text-base text-white font-semibold truncate">
                    You watched {adaptation.animeTitle} Episode {adaptation.watchedEpisode}
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {adaptation.filler
                      ? `That episode is anime-original — the manga story resumes at Chapter ${adaptation.nextChapter}.`
                      : `The anime stopped at Chapter ${adaptation.lastAdaptedChapter} — pick up where it left off.`}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/25 shrink-0">
                  Continue from Chapter {adaptation.nextChapter}
                  <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          </section>
        )}

        <div className="mt-8">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-light" /> Chapters {chaptersTotal > 0 && `(${chaptersTotal})`}
          </h2>

          {chapters.length === 0 && !chLoading ? (
            <p className="text-gray-500 text-sm">No chapters available.</p>
          ) : (
            <div className="space-y-1">
              {chapters.map((ch) => (
                <Link
                  key={ch.id}
                  to={`/manga/${id}/read/${encodeURIComponent(ch.id)}`}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/10 transition-all group"
                >
                  <span className="w-8 text-center text-xs font-mono text-gray-500 shrink-0">
                    {ch.chapter ? `#${ch.chapter}` : '-'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate group-hover:text-white transition-colors">
                      {ch.title || `Chapter ${ch.chapter}`}
                    </p>
                    {ch.pages > 0 && (
                      <p className="text-[11px] text-gray-600">{ch.pages} pages</p>
                    )}
                  </div>
                  {ch.publishedAt && (
                    <span className="text-[11px] text-gray-600 shrink-0">
                      {new Date(ch.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                  <Play className="w-4 h-4 text-gray-600 group-hover:text-primary-light transition-colors shrink-0" />
                </Link>
              ))}
              {chLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              )}
              {!chLoading && showLoadMore && (
                <button
                  onClick={loadMore}
                  className="w-full py-3 text-sm text-primary-light hover:text-white border border-white/5 hover:border-primary/30 rounded-lg transition-colors"
                >
                  Load More Chapters
                </button>
              )}
            </div>
          )}
        </div>

        {!animeLoading && linkedAnime && (() => {
          const cw = (user?.continueWatching || []).find((e) => String(e.animeId) === String(linkedAnime.anilistId))
          return (
            <section className="mt-10 animate-[fadeSlideUp_300ms_ease-out]">
              <div className="flex items-center gap-2 mb-4">
                <Tv className="w-5 h-5 text-primary-light" />
                <h2 className="text-lg font-bold text-white">Watch the Anime</h2>
              </div>
              <Link
                to={`/anime/${linkedAnime.anilistId}`}
                className="block group"
              >
                <div className="bg-[#161B2E] rounded-2xl border border-white/[0.08] shadow-xl shadow-black/30 overflow-hidden hover:border-primary/30 transition-all duration-300">
                  <div className="flex flex-col md:flex-row items-stretch">
                    <div className="w-full md:w-32 shrink-0">
                      <div className="aspect-[3/4] md:aspect-auto md:h-full">
                        {linkedAnime.coverImage ? (
                          <img src={linkedAnime.coverImage} alt={linkedAnime.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                            <Film className="w-8 h-8 text-gray-600" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 p-4 md:p-6 flex flex-col justify-between gap-3">
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary-light border border-primary/30 mb-2">
                          <Tv className="w-3 h-3" /> Anime Adaptation
                        </span>
                        <h3 className="text-lg font-bold text-white group-hover:text-primary-light transition-colors">
                          {linkedAnime.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            linkedAnime.status === 'RELEASING' ? 'bg-green-500/20 text-green-400' :
                            linkedAnime.status === 'FINISHED' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {linkedAnime.status === 'RELEASING' ? 'Airing' : linkedAnime.status === 'FINISHED' ? 'Finished' : linkedAnime.status}
                          </span>
                          {linkedAnime.episodes && <span>{linkedAnime.episodes} Episodes</span>}
                          {linkedAnime.studio && <span>Studio: {linkedAnime.studio}</span>}
                          {linkedAnime.rating && (
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {linkedAnime.rating}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        {cw ? (
                          <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/25">
                            <Play className="w-4 h-4 fill-white" />
                            Continue Watching Episode {cw.episode}
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/25">
                            <Play className="w-4 h-4 fill-white" />
                            Watch Now
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </section>
          )
        })()}
      </div>
    </div>
  )
}
