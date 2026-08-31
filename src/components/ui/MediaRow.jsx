import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import AnimeCard from './AnimeCard'

export default function MediaRow({ title, icon: Icon, animeList = [], seeAllLink, size = 'normal' }) {
  const scrollerRef = useRef(null)

  const scrollBy = (dir) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.82, 380), behavior: 'smooth' })
  }

  if (!animeList.length) return null

  return (
    <section className="group/row relative">
      {/* Heading — 80-90px padding on desktop, 30-34px title */}
      <div className="flex items-center justify-between mb-4 kx-shell-padding">
        <h2 className="flex items-center gap-3">
          <span className="kx-section-accent" />
          <span className="kx-section-title">{title}</span>
          <span className="kx-count-badge hidden sm:inline-flex">{animeList.length}</span>
        </h2>
        {seeAllLink && (
          <Link to={seeAllLink} className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-white/35 hover:text-white/70 transition-colors">
            See all <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="relative">
        <button aria-label="Scroll left" onClick={() => scrollBy(-1)}
          className="kx-row-arrow left-0 rounded-r-xl hidden lg:flex">
          <ChevronLeft className="w-7 h-7" />
        </button>

        <div
          ref={scrollerRef}
          className="flex overflow-x-auto scrollbar-hide scroll-smooth pb-3 kx-shell-padding"
          style={{ gap: '24px' }}
        >
          {animeList.map((a) => (
            <AnimeCard key={`${a.id}-${a.title}`} anime={a} size={size} />
          ))}
        </div>

        <button aria-label="Scroll right" onClick={() => scrollBy(1)}
          className="kx-row-arrow right-0 rounded-l-xl hidden lg:flex"
          style={{ background: 'linear-gradient(270deg, rgba(8,13,24,0.92), transparent)' }}>
          <ChevronRight className="w-7 h-7" />
        </button>
      </div>
    </section>
  )
}
