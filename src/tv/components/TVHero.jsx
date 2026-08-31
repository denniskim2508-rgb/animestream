import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Info, Plus, Check } from 'lucide-react'
import { useFocusable, useFocusContainer } from '../TVFocusManager'
import { useAuth } from '../../context/AuthContext'

const ROTATE_MS = 9000
const FADE_MS = 280
const IDLE_RESUME_MS = 8000

export default function TVHero({ animeList, exitDown }) {
  const navigate = useNavigate()
  const { user, toggleWatchlist } = useAuth()
  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef(null)
  const idleRef = useRef(null)

  const count = animeList?.length || 0
  const sectionRef = useRef(null)

  const advance = useCallback(() => {
    // Never swap content while a hero control holds D-pad focus — the keyed
    // remount below would unregister the focused button and yank focus back
    // to the navbar. Postpone the rotation instead.
    const guard = () => sectionRef.current && sectionRef.current.querySelector('.tv-focused')
    const resetTimer = () => {
      clearInterval(timerRef.current)
      timerRef.current = setInterval(advance, ROTATE_MS)
    }
    if (guard()) { resetTimer(); return }
    setFading(true)
    setTimeout(() => {
      // Re-check right before committing. A keypress can focus a hero control
      // during the fade; swapping then would remount the focused button and
      // drop the D-pad focus ring. Abort the rotation in that case.
      if (guard()) {
        setFading(false)
        resetTimer()
        return
      }
      setCurrent((c) => (count ? (c + 1) % count : 0))
      setFading(false)
    }, FADE_MS)
  }, [count])

  // Rotate while idle. Any key (D-pad/OK) or click pauses immediately;
  // rotation resumes after IDLE_RESUME_MS without input.
  useEffect(() => {
    if (count < 2) return undefined
    const startTimer = () => {
      clearInterval(timerRef.current)
      timerRef.current = setInterval(advance, ROTATE_MS)
    }
    const bump = () => {
      clearInterval(timerRef.current)
      clearTimeout(idleRef.current)
      idleRef.current = setTimeout(startTimer, IDLE_RESUME_MS)
    }
    startTimer()
    window.addEventListener('keydown', bump, true)
    window.addEventListener('pointerdown', bump, true)
    return () => {
      clearInterval(timerRef.current)
      clearTimeout(idleRef.current)
      window.removeEventListener('keydown', bump, true)
      window.removeEventListener('pointerdown', bump, true)
    }
  }, [advance, count])

  const anime = count ? animeList[Math.min(current, count - 1)] : null
  const continueEp = anime
    ? (user?.continueWatching || []).find((e) => String(e.animeId) === String(anime.id))
    : null

  // Hero is a focusable container: LEFT/RIGHT navigate its controls; at the
  // boundaries LEFT and UP exit deterministically to the navbar HOME; DOWN
  // exits to the next content section (trending). No geometry guessing here.
  const hero = useFocusContainer({
    id: 'hero',
    region: 'hero',
    preferredChildKey: 'hero-watch',
    exits: { up: 'navbar-home', left: 'navbar-home', down: exitDown || null },
    // DOWN exits straight to the next content section (trending) and UP back to
    // the navbar — never descend into the sibling hero controls for these. The
    // hero's three controls are traversed horizontally (RIGHT/LEFT) only.
    exitFirst: ['down', 'up'],
  })
  const watchFocus = useFocusable({
    onSelect: () => anime && navigate(`/tv/watch/${anime.id}/${continueEp?.episode || 1}`),
    region: 'hero',
    container: 'hero',
    focusKey: 'hero-watch',
  })
  const listFocus = useFocusable({
    onSelect: () => {
      if (!anime) return
      toggleWatchlist({
        animeId: String(anime.id), id: anime.id, title: anime.title,
        coverImage: anime.coverImage, episodes: anime.episodes,
        rating: anime.rating, releaseYear: anime.releaseYear,
      })
    },
    region: 'hero',
    container: 'hero',
    focusKey: 'hero-list',
  })
  const infoFocus = useFocusable({
    onSelect: () => anime && navigate(`/tv/anime/${anime.id}`),
    region: 'hero',
    container: 'hero',
    focusKey: 'hero-info',
  })

  if (!anime) return null

  const inWatchlist = (user?.watchlist || []).some((w) => String(w.animeId ?? w.id) === String(anime.id))
  const cleanDesc = (anime.description || '').replace(/<[^>]*>/g, '').slice(0, 300)

  return (
    <section
      ref={(el) => { sectionRef.current = el; if (hero.ref) hero.ref.current = el }}
      className="relative w-full overflow-hidden bg-kx-bg"
      style={{ height: '500px' }}>

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

      <div className="absolute inset-0 kx-hero-vignette" />
      <div className="absolute inset-x-0 bottom-0 h-36 pointer-events-none"
        style={{ background: 'linear-gradient(to top, #080D18 0%, rgba(8,13,24,0.75) 42%, transparent 100%)' }} />

      <div className={`absolute inset-0 flex flex-col justify-center px-4 sm:px-6 lg:pl-20 lg:pr-10 max-w-[1400px] mx-auto transition-all duration-300 ${fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
        <div className="kx-fade-up" style={{ maxWidth: '620px' }}>

          <h1 className="text-white font-black leading-[0.95] mb-4 drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)] text-3xl sm:text-4xl lg:text-[40px]"
            style={{ fontFamily: 'Outfit', letterSpacing: '-0.02em' }}>
            {anime.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
            {anime.rating != null && (
              <span className="inline-flex items-center gap-1.5">
                <span style={{ color: '#facc15', fontSize: '14px', lineHeight: 1 }}>★</span>
                <span className="text-white font-extrabold text-sm">{Number(anime.rating).toFixed(1)}</span>
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

          {cleanDesc && (
            <p className="hidden sm:block text-white/55 leading-relaxed mb-6 line-clamp-3"
              style={{ fontSize: '18px', lineHeight: 1.55, maxWidth: '980px' }}>
              {cleanDesc}{cleanDesc.length >= 300 ? '…' : ''}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              ref={watchFocus.ref}
              type="button"
              onClick={() => navigate(`/tv/watch/${anime.id}/${continueEp?.episode || 1}`)}
              className="inline-flex items-center justify-center gap-2.5 font-black text-white select-none shrink-0 hover:brightness-[1.07] active:scale-[0.98] transition-all"
              style={{
                width: '330px', height: '68px', borderRadius: '16px',
                background: 'linear-gradient(135deg,#8B5CF6 0%,#6366F1 45%,#4F46E5 100%)',
                fontSize: '14px', letterSpacing: '0.05em',
                boxShadow: '0 10px 32px rgba(139,92,246,0.32), inset 0 1px 0 rgba(255,255,255,0.22)',
              }}
            >
              <Play className="w-5 h-5 fill-white text-white" />
              {continueEp ? `RESUME · EP ${continueEp.episode}` : 'WATCH NOW'}
            </button>
            <button
              ref={listFocus.ref}
              type="button"
              onClick={() => toggleWatchlist({
                animeId: String(anime.id), id: anime.id, title: anime.title,
                coverImage: anime.coverImage, episodes: anime.episodes,
                rating: anime.rating, releaseYear: anime.releaseYear,
              })}
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
            <button
              ref={infoFocus.ref}
              type="button"
              onClick={() => navigate(`/tv/anime/${anime.id}`)}
              aria-label="More information"
              className="inline-flex items-center justify-center shrink-0 hover:bg-white/[0.11] transition-colors"
              style={{
                width: '68px', height: '68px', borderRadius: '999px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.11)',
              }}
            >
              <Info className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
