import { useParams } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { fetchByGenre } from '../api/anilist'
import { getAllGenres, getGenreIcon } from '../data/mockData'
import AnimeCard from '../components/ui/AnimeCard'

export default function GenrePage() {
  const { genreId } = useParams()
  const allGenres = getAllGenres()
  const genre = allGenres.find((g) => g.id === genreId)

  const genreName = genre?.name || genreId.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
  const genreIcon = getGenreIcon(genreName)

  const [anime, setAnime] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)

  const load = useCallback(async (pageNum) => {
    setLoading(true)
    try {
      const data = await fetchByGenre(genreName, pageNum, 20)
      if (pageNum === 1) setAnime(data.results)
      else setAnime((prev) => [...prev, ...data.results])
      setHasNext(data.pageInfo.hasNextPage)
    } catch {
      if (pageNum === 1) setAnime([])
    } finally {
      setLoading(false)
    }
  }, [genreName])

  useEffect(() => {
    setPage(1)
    load(1)
  }, [load])

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    load(next)
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <span className="text-5xl">{genreIcon}</span>
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">{genreName}</h1>
          {!loading && <p className="text-gray-400 text-sm mt-1">{anime.length} anime</p>}
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
                className="px-8 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-full transition-all disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">No anime found in this genre</p>
        </div>
      )}
    </div>
  )
}
