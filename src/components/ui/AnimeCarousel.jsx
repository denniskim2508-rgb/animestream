import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import AnimeCard from './AnimeCard'

export default function AnimeCarousel({ title, animeList, size = 'normal', seeAllLink }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  const scroll = (direction) => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
    setTimeout(checkScroll, 400)
  }

  return (
    <div className="relative group/section">
      <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
        {seeAllLink && (
          <a href={seeAllLink} className="text-sm text-primary-light hover:text-primary transition-colors font-medium">
            See All →
          </a>
        )}
      </div>

      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-950/90 to-transparent z-10 flex items-center justify-center opacity-0 group-hover/section:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-950/90 to-transparent z-10 flex items-center justify-center opacity-0 group-hover/section:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 pb-4"
        >
          {animeList.map((anime) => (
            <AnimeCard key={anime.id} anime={anime} size={size} />
          ))}
        </div>
      </div>
    </div>
  )
}
