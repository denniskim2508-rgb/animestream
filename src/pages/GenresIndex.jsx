import { Link } from 'react-router-dom'
import { getAllGenres } from '../data/mockData'

export default function GenresIndex() {
  const genres = getAllGenres()

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      <h1 className="text-3xl font-black text-white mb-2">Browse by Genre</h1>
      <p className="text-gray-400 mb-8">Explore anime across every genre and find your next favorite series</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {genres.map((genre) => (
          <Link
            key={genre.id}
            to={`/genres/${genre.id}`}
            className="group relative overflow-hidden rounded-xl aspect-[3/4] flex items-end transition-all hover:scale-105 hover:shadow-xl"
          >
            <img
              src={genre.image}
              alt={genre.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <span className="relative z-10 w-full text-center text-sm font-bold text-white pb-3 drop-shadow-lg">
              {genre.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
