import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Play, Info, Star, ChevronLeft, ChevronRight } from 'lucide-react'
import ShowMore from './ShowMore'

export default function HeroBanner({ animeList }) {
  const [current, setCurrent] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const goTo = useCallback((index) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrent(index)
    setTimeout(() => setIsTransitioning(false), 600)
  }, [isTransitioning])

  const next = useCallback(() => {
    goTo((current + 1) % animeList.length)
  }, [current, animeList.length, goTo])

  const prev = useCallback(() => {
    goTo((current - 1 + animeList.length) % animeList.length)
  }, [current, animeList.length, goTo])

  useEffect(() => {
    const timer = setInterval(next, 8000)
    return () => clearInterval(timer)
  }, [next])

  const anime = animeList[current]

  return (
    <div className="relative w-full h-[70vh] min-h-[500px] max-h-[800px] overflow-hidden">
      {animeList.map((a, i) => (
        <div
          key={a.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === current ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <img
            src={a.bannerImage}
            alt={a.title}
            className="w-full h-full object-cover"
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-hero hidden sm:block" />
      <div className="absolute inset-0 bg-gradient-hero-mobile sm:hidden" />

      <div className="absolute bottom-0 left-0 right-0 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
        <div
          className={`transition-all duration-600 ${
            isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {(anime.genres || []).slice(0, 3).map((g) => (
              <span
                key={g}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-white/10 text-white/80 backdrop-blur-sm"
              >
                {g}
              </span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white mb-2 leading-tight max-w-3xl">
            {anime.title}
          </h1>
          <div className="text-sm sm:text-base text-gray-300 max-w-2xl mb-2 hidden sm:block">
            <ShowMore text={anime.description} lines={2} />
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-1.5">
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              <span className="text-lg font-bold text-white">{anime.rating}</span>
            </div>
            <span className="text-sm text-gray-400">{anime.episodes} Episodes</span>
            <span className="text-sm text-gray-400">{anime.releaseYear}</span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-anime-red/20 text-anime-red border border-anime-red/30">
              {anime.status}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/watch/${anime.id}/1?total=${anime.episodes || 0}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-full transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-95"
            >
              <Play className="w-5 h-5 fill-white" /> Watch Now
            </Link>
            <Link
              to={`/anime/${anime.id}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full backdrop-blur-sm transition-all active:scale-95"
            >
              <Info className="w-5 h-5" /> More Info
            </Link>
          </div>
        </div>
      </div>

      <button
        onClick={prev}
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm flex items-center justify-center text-white transition-all opacity-0 hover:opacity-100 focus:opacity-100"
      >
        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
      <button
        onClick={next}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm flex items-center justify-center text-white transition-all opacity-0 hover:opacity-100 focus:opacity-100"
      >
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {animeList.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === current ? 'w-8 bg-primary' : 'w-2 bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
