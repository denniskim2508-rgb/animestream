import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, X, TrendingUp } from 'lucide-react'
import { searchAnime, fetchTrendingAnime } from '../api/anilist'
import { getAllGenres } from '../data/mockData'
import AnimeCard from '../components/ui/AnimeCard'

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [trending, setTrending] = useState([])

  useEffect(() => {
    fetchTrendingAnime(1, 10).then(setTrending).catch(() => {})
  }, [])

  useEffect(() => {
    if (query) {
      setSearchParams({ q: query }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }, [query, setSearchParams])

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const data = await searchAnime(q.trim(), 1, 20)
      setResults(data.results)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 400)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const genres = getAllGenres()

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for anime titles..."
            autoFocus
            className="w-full pl-14 pr-12 py-4 bg-surface border border-white/10 rounded-2xl text-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {query ? (
        <div>
          <p className="text-sm text-gray-400 mb-6">
            {searching ? 'Searching...' : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`}
          </p>
          {searching ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[3/4] rounded-xl skeleton" />
                  <div className="mt-2 space-y-2">
                    <div className="h-4 rounded skeleton w-3/4" />
                    <div className="h-3 rounded skeleton w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results.map((anime) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <SearchIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-lg text-gray-400">No anime found matching your search</p>
              <p className="text-sm text-gray-500 mt-2">Try different keywords or browse our collection</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          {trending.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="w-5 h-5 text-primary-light" />
                <h2 className="text-lg font-semibold text-white">Trending Anime</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-12">
                {trending.map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))}
              </div>
            </>
          )}

          <h2 className="text-lg font-semibold text-white mb-4">Browse Genres</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {genres.map((genre) => (
              <Link
                key={genre.id}
                to={`/genres/${genre.id}`}
                className="flex items-center gap-3 p-4 rounded-xl border border-white/5 hover:bg-white/5 transition-all"
              >
                <span className="text-2xl">{genre.icon}</span>
                <span className="text-sm font-medium text-white">{genre.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
