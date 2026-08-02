import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Search, Loader2, BookOpen, Eye } from 'lucide-react'
import { searchManga, getTrendingManga, getLatestManga } from '../api/manga'

function MangaCard({ manga }) {
  return (
    <Link to={`/manga/${manga.id}`} className="group">
      <div className="aspect-[3/4] rounded-xl overflow-hidden relative bg-gray-900">
        {manga.coverImage ? (
          <img src={manga.coverImage} alt={manga.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(manga.title?.slice(0, 2) || '?')}&background=7c3aed&color=fff&size=200` }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800"><BookOpen className="w-8 h-8 text-gray-600" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        {manga.followedCount > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-gray-300 backdrop-blur-sm">
            <Eye className="w-3 h-3" />{(manga.followedCount / 1000).toFixed(1)}k
          </div>
        )}
      </div>
      <h3 className="text-sm font-semibold text-white truncate mt-2 group-hover:text-primary-light transition-colors">{manga.title}</h3>
      <p className="text-[11px] text-gray-500 truncate">{manga.author}</p>
    </Link>
  )
}

export default function MangaSearch() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const sort = searchParams.get('sort') || ''
  const [input, setInput] = useState(query)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadedAll, setLoadedAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!query && !sort) return
    setLoading(true)
    setResults([])
    setLoadedAll(false)

    const fetcher = query
      ? searchManga(query, 30)
      : sort === 'latest' ? getLatestManga(30) : getTrendingManga(30)

    fetcher.then((res) => {
      if (!cancelled) { setResults(res.data); setLoadedAll(true) }
    }).catch(() => { if (!cancelled) setLoadedAll(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [query, sort])

  const handleSearch = (e) => {
    e.preventDefault()
    if (input.trim()) window.location.href = `/manga/search?q=${encodeURIComponent(input.trim())}`
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-7xl mx-auto">
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Search manga..." autoFocus
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-sm"
            />
          </div>
        </form>

        {query && <p className="text-sm text-gray-400 mb-4">Results for "{query}"</p>}
        {sort === 'trending' && <h1 className="text-lg font-bold text-white mb-4">Trending Manga</h1>}
        {sort === 'latest' && <h1 className="text-lg font-bold text-white mb-4">Latest Updates</h1>}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map((manga) => <MangaCard key={manga.id} manga={manga} />)}
          </div>
        ) : (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {query ? `No results found for "${query}"` : 'Start searching for manga'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
