import { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Play, Plus, Check, Heart } from 'lucide-react'
import { useFocusable, TVRegionContext, TVContainerContext } from '../TVFocusManager'
import { useAuth } from '../../context/AuthContext'

export default function TVAnimeCard({ anime, autoFocus = false, tvScope, exitLeft = null }) {
  const navigate = useNavigate()
  const [imageLoaded, setImageLoaded] = useState(false)
  const { user, toggleFavorite, toggleWatchlist } = useAuth()
  const region = useContext(TVRegionContext)
  const container = useContext(TVContainerContext)
  const focus = useFocusable({
    onSelect: () => anime?.id && navigate(`/tv/anime/${anime.id}`),
    autoFocus,
    scope: tvScope || 'root',
    region,
    container: container || undefined,
    // Stable logical key based on anime id (not array index) so identity
    // survives reordering/remounts within the row.
    focusKey: container && anime?.id ? `${container}-${anime.id}` : null,
    // First-card LEFT exits deterministically to its parent navbar item.
    exit: exitLeft ? { left: exitLeft } : null,
  })
  if (!anime) return null

  const isFav = user?.favorites?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)
  const inWatchlist = user?.watchlist?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)

  return (
    <div className="kx-anime-card shrink-0 group" style={{ width: 'var(--kx-card-w, 184px)' }}>
      <button
        ref={focus.ref}
        type="button"
        onClick={() => navigate(`/tv/anime/${anime.id}`)}
        className="block w-full text-left focus:outline-none"
      >
        <div className="kx-poster relative aspect-[2/3] bg-kx-surface2">
          {!imageLoaded && <div className="absolute inset-0 skeleton" />}
          {anime.coverImage ? (
            <img
              src={anime.coverImage}
              alt={anime.title || ''}
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
              className={`w-full h-full object-cover transition-opacity duration-400 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a2338] to-[#0D1320]">
              <span className="text-4xl font-black text-white/15" style={{ fontFamily: "'Outfit', sans-serif" }}>KX</span>
            </div>
          )}

          <div className="absolute inset-0 kx-poster-shade opacity-90 group-hover:opacity-100 transition-opacity pointer-events-none" />

          {anime.rating != null && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold"
              style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)', color: '#facc15' }}>
              <Star className="w-3 h-3 fill-[#facc15] text-[#facc15]" /> {Number(anime.rating).toFixed(1)}
            </span>
          )}

          {anime.episodes && (
            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
              style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)', color: 'rgba(255,255,255,0.85)' }}>
              {anime.episodes} EP
            </span>
          )}

          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center gap-2 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none">
            {user && (
              <span className="contents">
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWatchlist(anime) }}
                  className="pointer-events-auto w-9 h-9 rounded-full bg-white/14 hover:bg-[#8B5CF6] hover:text-[#150b29] backdrop-blur-md border border-white/20 flex items-center justify-center transition-colors text-white"
                >
                  {inWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(anime) }}
                  className={`pointer-events-auto w-9 h-9 rounded-full bg-white/14 hover:bg-[#ef4444] backdrop-blur-md border border-white/20 flex items-center justify-center transition-colors ${isFav ? 'text-[#ef4444]' : 'text-white'}`}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-[#ef4444]' : ''}`} />
                </span>
              </span>
            )}
          </div>

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="mt-14 w-11 h-11 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: 'rgba(255,255,255,0.92)' }}>
              <Play className="w-5 h-5 fill-[#080D18] text-[#080D18] ml-0.5" />
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-8 pointer-events-none">
            <h3 className="text-white font-semibold leading-snug line-clamp-2 group-hover:text-white transition-colors"
              style={{ fontSize: '15px', lineHeight: 1.35 }}>
              {anime.title || 'Untitled'}
            </h3>
            <p className="text-white/45 mt-0.5" style={{ fontSize: '13px', lineHeight: 1.3 }}>
              {anime.releaseYear ? anime.releaseYear : anime.format === 'MOVIE' ? 'Movie' : ''}
            </p>
          </div>
        </div>
      </button>
    </div>
  )
}
