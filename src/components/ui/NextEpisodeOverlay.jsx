import { useEffect, useState, useRef } from 'react'
import { Play, X, Loader2 } from 'lucide-react'

export default function NextEpisodeOverlay({
  visible,
  nextEpisode,
  totalEpisodes,
  animeTitle,
  countdown: initialCountdown,
  loading,
  onWatchNow,
  onCancel,
}) {
  const [countdown, setCountdown] = useState(initialCountdown)
  const [entering, setEntering] = useState(false)
  const timerRef = useRef(null)
  const countdownPositive = countdown > 0

  useEffect(() => {
    if (visible) {
      setCountdown(initialCountdown)
      requestAnimationFrame(() => setEntering(true))
    } else {
      setEntering(false)
    }
  }, [visible, initialCountdown])

  useEffect(() => {
    if (!visible || !countdownPositive || loading) {
      clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [visible, countdownPositive, loading])

  if (!visible) return null

  return (
    <div
      className={`absolute bottom-16 right-4 z-30 w-[320px] sm:w-[360px] transition-all duration-500 ease-out ${
        entering
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-gray-900/90 backdrop-blur-xl shadow-2xl shadow-black/60">
        <div className="relative px-5 pt-4 pb-4">
          <button
            onClick={onCancel}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            title="Cancel autoplay"
          >
            <X className="w-4 h-4" />
          </button>

          <p className="text-[11px] font-bold uppercase tracking-widest text-primary-light mb-2">
            Up Next
          </p>

          <p className="text-sm text-gray-300 mb-0.5">
            Episode {nextEpisode} of {totalEpisodes}
          </p>
          <p className="text-base font-semibold text-white truncate">
            {animeTitle}
          </p>

          <div className="mt-3 mb-3">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${((initialCountdown - countdown) / initialCountdown) * 100}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading next episode...
              </span>
            ) : (
              `Starts in ${countdown} ${countdown === 1 ? 'second' : 'seconds'}`
            )}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onWatchNow}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Play className="w-4 h-4 fill-white" />
              Watch Now
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
