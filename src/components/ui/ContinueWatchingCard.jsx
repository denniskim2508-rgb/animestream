import { Link } from 'react-router-dom'
import { Play, X } from 'lucide-react'
import { useState } from 'react'

function formatTimestamp(seconds) {
  if (!seconds || seconds <= 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export default function ContinueWatchingCard({ item, onRemove }) {
  const [hovered, setHovered] = useState(false)
  const progress = item.duration > 0 ? Math.min((item.currentTime / item.duration) * 100, 100) : 0

  return (
    <div
      className="w-[160px] sm:w-[200px] shrink-0 group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        to={`/watch/${item.animeId}/${item.episode}?total=${item.totalEpisodes || 0}&audio=${item.audioMode || 'sub'}`}
        className="block"
      >
        <div className="aspect-video rounded-xl overflow-hidden relative bg-gray-900">
          <img
            src={item.coverImage}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.title?.slice(0,2) || '?')}&background=7c3aed&color=fff&size=200` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

          {hovered && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/40 backdrop-blur-sm transition-transform scale-100 group-hover:scale-110">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
            </div>
          )}

          <div className="absolute top-2 left-2">
            <span className="px-2 py-0.5 rounded-md bg-primary/90 text-[10px] font-bold text-white backdrop-blur-sm">
              Ep {item.episode}
            </span>
          </div>

          {item.totalEpisodes > 0 && (
            <div className="absolute top-2 right-2">
              <span className="px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-medium text-gray-300 backdrop-blur-sm">
                {item.episode}/{item.totalEpisodes}
              </span>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0">
            <div className="h-[3px] bg-white/20 w-full">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </Link>

      <div className="mt-2 px-1">
        <h3 className="text-sm font-semibold text-white truncate group-hover:text-primary-light transition-colors">
          {item.title}
        </h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {formatTimestamp(item.currentTime)} / {formatTimestamp(item.duration)}
        </p>
      </div>

      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove(item.animeId, item.episode)
          }}
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gray-900/90 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 z-10"
          title="Remove"
        >
          <X className="w-3 h-3 text-gray-400 hover:text-white" />
        </button>
      )}
    </div>
  )
}
