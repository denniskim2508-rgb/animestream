import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { BookOpen, Clock, Calendar, User, Pen, Star, Eye, ChevronLeft, Play, Loader2 } from 'lucide-react'
import { getMangaDetails, getMangaChapters } from '../api/mangadex'
import { SkeletonPage } from '../components/ui/Skeleton'

export default function MangaDetail() {
  const { id } = useParams()
  const [manga, setManga] = useState(null)
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chPage, setChPage] = useState(0)
  const [chLoading, setChLoading] = useState(false)
  const perPage = 50

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setChPage(0)

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

    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    let cancelled = false
    setChLoading(true)
    getMangaChapters(id, 'en', perPage, chPage * perPage)
      .then((res) => {
        if (!cancelled) {
          setChapters((prev) => chPage === 0 ? res.data : [...prev, ...res.data])
          setChLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setChLoading(false) })
    return () => { cancelled = true }
  }, [id, chPage])

  const loadMore = () => setChPage((p) => p + 1)

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

        <div className="mt-8">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-light" /> Chapters ({chapters.length})
          </h2>

          {chapters.length === 0 && !chLoading ? (
            <p className="text-gray-500 text-sm">No chapters available.</p>
          ) : (
            <div className="space-y-1">
              {chapters.map((ch) => (
                <Link
                  key={ch.id}
                  to={`/manga/${id}/read/${ch.id}`}
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
              {!chLoading && chapters.length % perPage === 0 && chapters.length > 0 && (
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
      </div>
    </div>
  )
}
