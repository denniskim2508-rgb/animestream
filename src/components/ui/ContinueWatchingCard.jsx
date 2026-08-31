import { Link } from 'react-router-dom'
import { Play, X } from 'lucide-react'

export default function ContinueWatchingCard({ item, onRemove }) {
  const percent = item.duration > 0
    ? Math.min(100, Math.round((item.currentTime / item.duration) * 100))
    : 0
  const remainingMin = item.duration > 0 && percent < 95
    ? Math.max(1, Math.round((item.duration - item.currentTime) / 60))
    : null

  return (
    <div className="kx-cw group shrink-0" style={{ width: '320px' }}>
      <style>{`
        @media (min-width: 640px)  { .kx-cw { width: 340px !important; } }
      `}</style>
      <Link to={`/watch/${item.animeId}/${item.episode || 1}?audio=${item.audioMode || 'sub'}`} className="block">
        <div className="relative aspect-video bg-kx-surface2 overflow-hidden">
          {item.coverImage && (
            <img src={item.coverImage} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
          )}
          {/* Only a subtle bottom gradient behind the text — no blur */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(8,13,24,0.88) 0%, rgba(8,13,24,0.20) 42%, transparent 68%)' }} />

          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest uppercase"
            style={{ background: 'rgba(139,92,246,0.92)', color: '#150b29' }}>
            {item.audioMode === 'dub' ? 'DUB' : 'SUB'}
          </span>
          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-bold"
            style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)', color: '#fff', border: '1px solid rgba(255,255,255,0.10)' }}>
            EP {item.episode}
          </span>

          {/* Center play on hover */}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', boxShadow: '0 8px 28px rgba(139,92,246,0.45)' }}>
              <Play className="w-6 h-6 fill-white text-white ml-0.5" />
            </span>
          </span>

          {/* Bottom info */}
          <div className="absolute inset-x-0 bottom-0 p-3.5">
            <h4 className="text-white font-semibold truncate drop-shadow" style={{ fontSize: '14px', lineHeight: 1.3 }}>{item.title}</h4>
            <p className="text-white/45 text-xs mt-0.5">Episode {item.episode}</p>
            <div className="kx-progress mt-2">
              <div style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 text-white/40" style={{ fontSize: '11px' }}>
              {remainingMin ? `${remainingMin} min remaining` : `${percent}% watched`}
            </p>
          </div>
        </div>
      </Link>

      {onRemove && (
        <button
          aria-label="Remove from Continue Watching"
          onClick={() => onRemove(item.animeId)}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/55 text-white/60 hover:text-white hover:bg-[#ef4444]/80 opacity-0 group-hover:opacity-100 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
