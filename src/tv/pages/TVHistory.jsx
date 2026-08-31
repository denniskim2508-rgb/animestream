import { useNavigate } from 'react-router-dom'
import { History as HistoryIcon, Play, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFocusable } from '../TVFocusManager'
import TVRow from '../components/TVRow'
import TVErrorState from '../components/TVErrorState'

function HistoryCard({ entry }) {
  const navigate = useNavigate()
  const focus = useFocusable({
    onSelect: () => navigate(`/tv/watch/${entry.animeId}/${entry.episode || 1}?audio=${entry.audioMode || 'sub'}`),
  })
  const percent = entry.progressPercent != null
    ? Math.min(100, Math.round(entry.progressPercent))
    : entry.duration > 0
      ? Math.min(100, Math.round((entry.currentTime / entry.duration) * 100))
      : 5
  const watchedLabel = entry.duration > 0
    ? `${Math.max(1, Math.round((entry.currentTime / 60)))} min watched`
    : `EP ${entry.episode}`
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => navigate(`/tv/watch/${entry.animeId}/${entry.episode || 1}?audio=${entry.audioMode || 'sub'}`)}
      className="tv-card relative w-[360px] shrink-0 rounded-2xl overflow-hidden text-left group"
    >
      <div className="relative aspect-video w-full bg-black/50">
        {entry.coverImage && (
          <img src={entry.coverImage} alt="" loading="lazy" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25 pointer-events-none" />
        {/* hover/focus play affordance */}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-[[data-tv-focusable]:focus]:opacity-100 transition-opacity">
          <span className="tv-btn-primary w-16 h-16 rounded-full flex items-center justify-center">
            <Play className="w-7 h-7 fill-current ml-0.5" />
          </span>
        </span>
        <span className="absolute top-2.5 left-2.5 tv-badge tv-badge-dub">{entry.audioMode === 'dub' ? 'DUB' : 'SUB'}</span>
        <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/80 px-2 py-0.5 text-sm font-bold">EP {entry.episode}</span>
        <span className="absolute inset-x-3 bottom-2 tv-progress-track !h-[5px]">
          <span className="tv-progress-fill block" style={{ width: `${percent}%` }} />
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="tv-clamp-1 text-base font-semibold leading-snug truncate min-h-[1.45em]">{entry.title || 'Untitled'}</p>
        <p className="text-xs text-white/50 mt-1">{watchedLabel} · {percent}%</p>
      </div>
    </button>
  )
}

function RemoveItemButton({ animeId, onRemove }) {
  const focus = useFocusable({ onSelect: () => onRemove(animeId) })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => onRemove(animeId)}
      className="inline-flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2 text-sm font-semibold text-red-300 bg-red-500/[0.07] border border-red-400/25 hover:bg-red-500/15 transition-colors"
    >
      <Trash2 className="w-4 h-4" /> Remove
    </button>
  )
}

export default function TVHistory() {
  const { user, removeContinueWatching } = useAuth()
  const clearFocus = useFocusable({ onSelect: () => (user?.continueWatching || []).forEach((e) => e.animeId && removeContinueWatching(e.animeId)) })
  const items = [...(user?.continueWatching || [])].filter((e) => e.animeId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  if (!items.length) {
    return (
      <TVErrorState
        icon={HistoryIcon}
        title="No watch history yet"
        message="Anything you play will show up here so you can jump back in."
      />
    )
  }

  return (
    <div className="pb-20 pt-8 tv-enter">
      <div className="px-16 mb-6 flex items-center gap-3">
        <span className="tv-accent-bar !h-9" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Watch History</h1>
        <span className="text-sm font-semibold text-white/40 bg-white/[0.06] border border-white/10 rounded-full px-3 py-0.5">{items.length}</span>
        {user && (
          <button
            ref={clearFocus.ref}
            type="button"
            onClick={() => items.forEach((i) => i.animeId && removeContinueWatching(i.animeId))}
            className="ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold text-red-300 bg-red-500/10 border border-red-400/30 hover:bg-red-500/20"
          >
            <Trash2 className="w-5 h-5" /> Clear All
          </button>
        )}
      </div>
      <TVRow title="Continue where you left off" count={null}>
        {items.map((entry) => (
          <div key={`${entry.animeId}-${entry.episode}`} className="shrink-0 w-[360px] flex flex-col gap-2">
            <HistoryCard entry={entry} />
            <RemoveItemButton animeId={entry.animeId} onRemove={removeContinueWatching} />
          </div>
        ))}
      </TVRow>
    </div>
  )
}
