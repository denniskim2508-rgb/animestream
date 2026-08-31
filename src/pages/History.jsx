import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import ContinueWatchingCard from '../components/ui/ContinueWatchingCard'
import { History as HistoryIcon, Trash2 } from 'lucide-react'

export default function History() {
  const { user, removeContinueWatching } = useAuth()
  const [items, setItems] = useState([])

  useEffect(() => {
    const raw = user?.continueWatching?.length
      ? user.continueWatching
      : (() => { try { return JSON.parse(localStorage.getItem('cw_guest') || '[]') } catch { return [] } })()
    setItems([...raw].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)))
  }, [user?.continueWatching])

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="flex items-center gap-3 text-3xl font-black text-white" style={{ fontFamily: 'Outfit' }}>
          <span className="w-1.5 h-8 rounded-full bg-gradient-to-b from-accent-light to-primary" />
          Watch History
        </h1>
        {items.length > 0 && (
          <span className="kx-chip">{items.length} titles</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="kx-panel px-6 py-16 text-center">
          <HistoryIcon className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-500">Nothing watched yet. Press play on anything and it will show up here.</p>
        </div>
      ) : (
        <>
          {user && (
            <button
              onClick={() => items.forEach((i) => removeContinueWatching(i.animeId))}
              className="mb-6 inline-flex items-center gap-2 kx-btn kx-btn-ghost h-10 px-4 text-sm !text-red-300 hover:!border-red-400/40"
            >
              <Trash2 className="w-4 h-4" /> Clear all
            </button>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-7">
            {items.map((item) => (
              <ContinueWatchingCard key={item.animeId} item={item} onRemove={removeContinueWatching} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
