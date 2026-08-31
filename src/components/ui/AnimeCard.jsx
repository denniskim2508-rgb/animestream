import { Link } from 'react-router-dom'
import { Star, Play, Plus, Check, Heart } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function AnimeCard({ anime, size = 'normal' }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const { user, toggleFavorite, toggleWatchlist } = useAuth()

  const isFav = user?.favorites?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)
  const inWatchlist = user?.watchlist?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)

  const sizeClasses = {
    small: 'w-[140px] sm:w-[160px]',
    normal: 'w-[160px] sm:w-[200px]',
    large: 'w-[200px] sm:w-[240px]',
  }

  const statusLabel = anime.format === 'MOVIE' ? 'Movie'
    : anime.format === 'OVA' ? 'OVA'
    : anime.format === 'ONA' ? 'ONA'
    : anime.format === 'SPECIAL' ? 'Special'
    : anime.format === 'TV_SHORT' ? 'TV Short'
    : anime.episodes ? `${anime.episodes} eps`
    : 'Ongoing'

  const airing = anime.nextAiringEpisode
  const airingLabel = airing ? formatAiring(airing.timeUntilAiring, airing.episode) : null

  return (
    <div className={`${sizeClasses[size]} shrink-0 group relative`}>
      <Link to={`/anime/${anime.id}`} className="block">
        <div className="aspect-[3/4] rounded-xl overflow-hidden relative anime-card-hover">
          {!imageLoaded && <div className="absolute inset-0 skeleton rounded-xl" />}
          <img
            src={anime.coverImage}
            alt={anime.title}
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Link
                to={`/watch/${anime.id}/1?total=${anime.episodes || 0}`}
                onClick={(e) => e.stopPropagation()}
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary-dark transition-colors"
              >
                <Play className="w-4 h-4 text-white fill-white" />
              </Link>
              {user && (
                <>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleWatchlist(anime)
                    }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    {inWatchlist ? <Check className="w-4 h-4 text-green-400" /> : <Plus className="w-4 h-4 text-white" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleFavorite(anime)
                    }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <Heart className={`w-4 h-4 ${isFav ? 'text-anime-red fill-anime-red' : 'text-white'}`} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="absolute top-2 right-2">
            <span className="px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              {statusLabel}
            </span>
          </div>

          {airingLabel && (
            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 rounded-md bg-primary/80 text-[10px] font-bold text-white backdrop-blur-sm">
                {airingLabel}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 px-1">
          <h3 className="text-sm font-semibold text-white truncate group-hover:text-primary-light transition-colors">
            {anime.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {anime.rating != null && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                <span className="text-xs font-medium text-gray-300">{anime.rating}</span>
              </div>
            )}
            {anime.rating != null && <span className="text-[10px] text-gray-500">·</span>}
            <span className="text-xs text-gray-500">{anime.releaseYear || '—'}</span>
          </div>
        </div>
      </Link>
    </div>
  )
}

function formatAiring(seconds, episode) {
  if (!seconds || seconds <= 0) return `Ep ${episode} today`
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (parts.length === 0) parts.push(`${mins}m`)
  return `Ep ${episode} in ${parts.join(' ')}`
}
