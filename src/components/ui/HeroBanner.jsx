import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Play, Info, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const ROTATE_MS = 9000

export default function HeroBanner({ animeList }) {
  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef(null)
  const { user, toggleWatchlist } = useAuth()

  const goTo = useCallback((index) => {
    if (index === current) return
    setFading(true)
    setTimeout(() => {
      setCurrent(index)
      setFading(false)
    }, 280)
  }, [current])

  const next = useCallback(() => goTo((current + 1) % animeList.length), [current, animeList.length, goTo])
  const prev = useCallback(() => goTo((current - 1 + animeList.length) % animeList.length), [current, animeList.length, goTo])

  useEffect(() => {
    timerRef.current = setInterval(next, ROTATE_MS)
    return () => clearInterval(timerRef.current)
  }, [next])

  const bumpTimer = () => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(next, ROTATE_MS)
  }

  if (!animeList?.length) return null
  const anime = animeList[current]
  const inWatchlist = user?.watchlist?.some(
    (item) => (typeof item === 'object' ? item.id : item) === anime.id
  )
  const cleanDesc = (anime.description || '').slice(0, 300)

  return (
    <section className="relative w-full overflow-hidden bg-kx-bg"
      style={{ height: '500px' }}>

      {/* ── Backdrop — sharp, no blur ── */}
      {animeList.map((a, i) => (
        <div key={a.id} className={`absolute inset-0 transition-opacity duration-700 ${i === current ? 'opacity-100' : 'opacity-0'}`}>
          <img
            src={a.bannerImage || a.coverImage}
            alt=""
            className={`w-full h-full object-cover ${i === current ? 'kx-kenburns' : ''}`}
            style={{ objectPosition: 'center 28%' }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        </div>
      ))}

      {/* Layered gradients OVER the image — keep artwork sharp */}
      <div className="absolute inset-0 kx-hero-vignette" />
      <div className="absolute inset-x-0 bottom-0 h-36 pointer-events-none"
        style={{ background: 'linear-gradient(to top, #080D18 0%, rgba(8,13,24,0.75) 42%, transparent 100%)' }} />

      {/* ── Content: 80px from left on desktop, vertically centered ── */}
      <div className={`absolute inset-0 flex flex-col justify-center px-4 sm:px-6 lg:pl-20 lg:pr-10 max-w-[1400px] mx-auto transition-all duration-300 ${fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
        <div className="kx-fade-up" key={anime.id} style={{ maxWidth: '620px' }}>

          {/* Title */}
          <h1 className="text-white font-black leading-[0.95] mb-4 drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)] text-3xl sm:text-4xl lg:text-[40px]"
            style={{ fontFamily: 'Outfit', letterSpacing: '-0.02em' }}>
            {anime.title}
          </h1>

          {/* Row 1: ★ rating · Year · Type pill · Episodes */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
            {anime.rating != null && (
              <span className="inline-flex items-center gap-1.5">
                <span style={{ color: '#facc15', fontSize: '14px', lineHeight: 1 }}>★</span>
                <span className="text-white font-extrabold text-sm">{anime.rating.toFixed(1)}</span>
              </span>
            )}
            {anime.releaseYear && <span className="text-white/75 text-sm font-medium">{anime.releaseYear}</span>}
            {anime.format && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase"
                style={{ color: '#A78BFA', border: '1.5px solid rgba(167,139,250,0.50)', background: 'rgba(139,92,246,0.10)' }}>
                {anime.format}
              </span>
            )}
            {anime.episodes
              ? <span className="text-white/60 text-sm">{anime.episodes} Episodes</span>
              : <span className="text-white/40 text-sm">Ongoing</span>}
          </div>

          {/* Row 2: Genre pills */}
          {(anime.genresRaw || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3.5">
              {(anime.genresRaw || []).slice(0, 3).map((g) => (
                <span key={g} className="px-3.5 py-1 rounded-full text-sm font-medium"
                  style={{
                    color: 'rgba(255,255,255,0.82)',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Row 3: Description — max 950-1100px, 2-3 lines */}
          {cleanDesc && (
            <p className="hidden sm:block text-white/55 leading-relaxed mb-6 line-clamp-3"
              style={{ fontSize: '18px', lineHeight: 1.55, maxWidth: '980px' }}>
              {cleanDesc}{cleanDesc.length >= 300 ? '…' : ''}
            </p>
          )}

          {/* Row 4: Buttons — 330×68 primary, 220×68 secondary, 68 circular */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to={`/watch/${anime.id}/1?total=${anime.episodes || 0}`}
              onClick={bumpTimer}
              className="inline-flex items-center justify-center gap-2.5 font-black text-white select-none shrink-0 hover:brightness-[1.07] active:scale-[0.98] transition-all"
              style={{
                width: '330px', height: '68px', borderRadius: '16px',
                background: 'linear-gradient(135deg,#8B5CF6 0%,#6366F1 45%,#4F46E5 100%)',
                fontSize: '14px', letterSpacing: '0.05em',
                boxShadow: '0 10px 32px rgba(139,92,246,0.32), inset 0 1px 0 rgba(255,255,255,0.22)',
              }}
            >
              <Play className="w-5 h-5 fill-white text-white" /> WATCH NOW
            </Link>
            {user ? (
              <button
                onClick={() => toggleWatchlist(anime)}
                className="inline-flex items-center justify-center gap-2 font-bold select-none shrink-0 hover:bg-white/[0.11] active:scale-[0.98] transition-all"
                style={{
                  width: '220px', height: '68px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  color: '#fff', fontSize: '13px', letterSpacing: '0.05em',
                }}
              >
                {inWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                {inWatchlist ? 'IN MY LIST' : 'MY LIST'}
              </button>
            ) : (
              <Link to="/login"
                className="inline-flex items-center justify-center gap-2 font-bold select-none shrink-0 hover:bg-white/[0.11] transition-colors"
                style={{
                  width: '220px', height: '68px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  color: '#fff', fontSize: '13px', letterSpacing: '0.05em',
                }}>
                <Plus className="w-5 h-5" /> MY LIST
              </Link>
            )}
            <Link to={`/anime/${anime.id}`}
              className="inline-flex items-center justify-center shrink-0 hover:bg-white/[0.11] transition-colors"
              style={{
                width: '68px', height: '68px', borderRadius: '999px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.11)',
              }}>
              <Info className="w-6 h-6 text-white" />
            </Link>
          </div>
        </div>
      </div>

      {/* Carousel arrows */}
      <button onClick={() => { prev(); bumpTimer() }} aria-label="Previous"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 hover:bg-black/60 backdrop-blur-md border border-white/10 hidden md:flex items-center justify-center text-white transition-all hover:scale-110 z-10">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button onClick={() => { next(); bumpTimer() }} aria-label="Next"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 hover:bg-black/60 backdrop-blur-md border border-white/10 hidden md:flex items-center justify-center text-white transition-all hover:scale-110 z-10">
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Slide indicators */}
      <div className="absolute bottom-5 right-6 lg:right-10 hidden sm:flex items-center gap-2 z-10">
        {animeList.map((_, i) => (
          <button
            key={i}
            onClick={() => { goTo(i); bumpTimer() }}
            aria-label={`Slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === current ? 'w-9 bg-[#8B5CF6] shadow-[0_0_10px_rgba(139,92,246,0.65)]' : 'w-3 bg-white/25 hover:bg-white/45'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
