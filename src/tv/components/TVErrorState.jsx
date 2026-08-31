import { RotateCcw } from 'lucide-react'
import TVButton from './TVButton'

export default function TVErrorState({ message = 'Unable to load content.', title = null, icon: Icon = null, onRetry, autoFocus = true }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center tv-enter">
      <div className="w-24 h-24 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center mb-7">
        {Icon ? (
          <Icon className="w-10 h-10 text-white/40" />
        ) : (
          <span className="text-4xl">⚠️</span>
        )}
      </div>
      {title && (
        <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>{title}</h2>
      )}
      <h2 className={`text-2xl font-bold text-white ${title ? '' : 'mb-2'}`}>{message}</h2>
      {!title && <p className="text-lg text-white/50 mb-8">Check your connection and try again.</p>}
      {onRetry && (
        <div className={title ? 'mt-6' : ''}>
          <TVButton onClick={onRetry} icon={RotateCcw} autoFocus={autoFocus}>
            Try Again
          </TVButton>
        </div>
      )}
    </div>
  )
}
