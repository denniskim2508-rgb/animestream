import { useState, useEffect, useCallback } from 'react'
import AnimeCard from '../components/ui/AnimeCard'
import { fetchBrowse } from '../api/anilist'
import { getAllGenres } from '../data/mockData'
import { SlidersHorizontal, ChevronRight } from 'lucide-react'

const SORT_OPTIONS = [
  { value: 'POPULARITY_DESC', label: 'Most Popular' },
  { value: 'SCORE_DESC', label: 'Top Rated' },
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'START_DATE_DESC', label: 'Newest' },
  { value: 'FAVOURITES_DESC', label: 'Most Favorited' },
  { value: 'TITLE_ROMAJI', label: 'A-Z' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'RELEASING', label: 'Airing' },
  { value: 'FINISHED', label: 'Completed' },
  { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
]

const SEASON_OPTIONS = [
  { value: '', label: 'All Seasons' },
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
]

export default function Browse() {
  const [anime, setAnime] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState('')
  const [sortBy, setSortBy] = useState('POPULARITY_DESC')
  const [status, setStatus] = useState('')
  const [season, setSeason] = useState('')

  const genres = getAllGenres()

  const loadAnime = useCallback(async (pageNum) => {
    setLoading(true)
    try {
      const data = await fetchBrowse({
        page: pageNum,
        perPage: 20,
        genre: selectedGenre || undefined,
        sort: sortBy,
        status: status || undefined,
        season: season || undefined,
      })
      setAnime(pageNum === 1 ? data.results : (prev) => [...prev, ...data.results])
      setHasNext(data.pageInfo.hasNextPage)
    } catch {
      if (pageNum === 1) setAnime([])
    } finally {
      setLoading(false)
    }
  }, [selectedGenre, sortBy, status, season])

  useEffect(() => {
    setPage(1)
    loadAnime(1)
  }, [loadAnime])

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    loadAnime(next)
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      <h1 className="text-3xl font-black text-white mb-6">Browse Anime</h1>

      <div className="space-y-4 mb-8">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedGenre('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !selectedGenre ? 'bg-primary text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            All
          </button>
          {genres.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGenre(g.name)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedGenre === g.name ? 'text-white' : 'text-gray-400 hover:text-white bg-white/5 hover:bg-white/10'
              }`}
              style={selectedGenre === g.name ? { backgroundColor: `${g.color}30`, color: g.color } : {}}
            >
              {g.icon} {g.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {SEASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && anime.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[3/4] rounded-xl skeleton" />
              <div className="mt-2 space-y-2">
                <div className="h-4 rounded skeleton w-3/4" />
                <div className="h-3 rounded skeleton w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : anime.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {anime.map((a) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>

          {hasNext && (
            <div className="flex justify-center mt-10">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-8 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-full transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Load More <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">No anime found matching your filters</p>
          <p className="text-sm text-gray-500 mt-2">Try adjusting your search criteria</p>
        </div>
      )}
    </div>
  )
}
