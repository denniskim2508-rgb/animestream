import { Link } from 'react-router-dom'
import { getAllGenres } from '../data/mockData'
import { ArrowRight } from 'lucide-react'

export default function GenresIndex() {
  const genres = getAllGenres()

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      <h1 className="text-3xl font-black text-white mb-2">Browse by Genre</h1>
      <p className="text-gray-400 mb-8">Explore anime across every genre and find your next favorite series</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {genres.map((genre) => (
          <Link
            key={genre.id}
            to={`/genres/${genre.id}`}
            className="group relative overflow-hidden rounded-2xl p-6 sm:p-8 transition-all hover:scale-[1.02] hover:shadow-xl"
            style={{
              background: `linear-gradient(135deg, ${genre.color}15, ${genre.color}05)`,
              border: `1px solid ${genre.color}20`,
            }}
          >
            <div className="relative z-10">
              <span className="text-5xl block mb-3">{genre.icon}</span>
              <h3 className="text-xl font-bold text-white mb-1">{genre.name}</h3>
              <div className="flex items-center gap-1 text-sm font-medium transition-colors" style={{ color: genre.color }}>
                Explore <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: `radial-gradient(circle at 80% 80%, ${genre.color}20, transparent)` }}
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
