import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Search, TrendingUp, Clock, Shuffle, BookOpen, Star, Eye, Loader2 } from 'lucide-react'
import { getTrendingManga, getLatestManga, getRandomManga, searchManga } from '../api/manga'
import { SkeletonCarousel } from '../components/ui/Skeleton'

function MangaCard({ manga }) {
  return (
    <Link
      to={`/manga/${manga.id}`}
      className="w-[160px] sm:w-[200px] shrink-0 group"
    >
      <div className="aspect-[3/4] rounded-xl overflow-hidden relative bg-gray-900">
        {manga.coverImage ? (
          <img
            src={manga.coverImage}
            alt={manga.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(manga.title?.slice(0, 2) || '?')}&background=7c3aed&color=fff&size=200` }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <BookOpen className="w-8 h-8 text-gray-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
          {manga.tags?.slice(0, 2).map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-medium text-gray-300 backdrop-blur-sm">
              {t}
            </span>
          ))}
        </div>
        {manga.followedCount > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-gray-300 backdrop-blur-sm">
            <Eye className="w-3 h-3" />
            {(manga.followedCount / 1000).toFixed(manga.followedCount >= 10000 ? 0 : 1)}k
          </div>
        )}
      </div>
      <div className="mt-2 px-1">
        <h3 className="text-sm font-semibold text-white truncate group-hover:text-primary-light transition-colors">
          {manga.title}
        </h3>
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">{manga.author}</p>
      </div>
    </Link>
  )
}

export default function MangaHome() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [randomManga, setRandomManga] = useState(null)
  const queryClient = useQueryClient()

  const { data: trending, isLoading: trendingLoading } = useQuery({
    queryKey: ['mangaTrending'],
    queryFn: () => getTrendingManga(20),
    staleTime: 5 * 60 * 1000,
  })

  const { data: latest, isLoading: latestLoading } = useQuery({
    queryKey: ['mangaLatest'],
    queryFn: () => getLatestManga(20),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    getRandomManga().then(setRandomManga).catch(() => {})
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/manga/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {randomManga && (
        <div className="relative h-[50vh] min-h-[400px] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/80 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent z-10" />
          {randomManga.coverImage ? (
            <img
              src={randomManga.coverImage.replace('.256.jpg', '.512.jpg')}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20" />
          )}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-6 sm:p-10 max-w-5xl">
            <div className="flex items-center gap-2 mb-2">
              <Shuffle className="w-3.5 h-3.5 text-primary-light" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary-light">Random Pick</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white mb-2 drop-shadow-lg">{randomManga.title}</h1>
            <p className="text-sm text-gray-300 mb-4 line-clamp-2 max-w-xl">{randomManga.description}</p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                to={`/manga/${randomManga.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-all active:scale-[0.98]"
              >
                <BookOpen className="w-4 h-4" /> View Details
              </Link>
              <button
                onClick={() => getRandomManga().then(setRandomManga).catch(() => {})}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all"
              >
                <Shuffle className="w-4 h-4" /> Another Random
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 sm:px-6 lg:px-8 -mt-6 relative z-30 mb-6">
        <form onSubmit={handleSearch} className="max-w-2xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search manga..."
              className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-sm"
            />
          </div>
        </form>
      </div>

      {trendingLoading || latestLoading ? (
        <div className="px-4 sm:px-6 lg:px-8">
          <SkeletonCarousel />
          <SkeletonCarousel />
        </div>
      ) : (
        <>
          <section className="mb-8 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary-light" /> Trending Manga
              </h2>
              <Link to="/manga/search?sort=trending" className="text-xs text-primary-light hover:underline">See All</Link>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {(trending?.data || []).map((manga) => (
                <MangaCard key={manga.id} manga={manga} />
              ))}
            </div>
          </section>

          <section className="mb-8 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-light" /> Latest Updates
              </h2>
              <Link to="/manga/search?sort=latest" className="text-xs text-primary-light hover:underline">See All</Link>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {(latest?.data || []).map((manga) => (
                <MangaCard key={manga.id} manga={manga} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
