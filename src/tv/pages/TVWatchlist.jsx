import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import TVAnimeCard from '../components/TVAnimeCard'
import { useFocusable, useFocusContainer, TVContainerContext, TVRegionContext } from '../TVFocusManager'

function Tab({ label, active, onClick, container, focusKey = null, autoFocus = false }) {
  const focus = useFocusable({ onSelect: onClick, container, focusKey, autoFocus })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      className={`rounded-xl px-8 py-3.5 text-xl font-bold border ${
        active ? 'bg-[var(--color-primary)] text-white border-transparent' : 'bg-white/5 text-white/70 border-white/10'
      }`}
    >
      {label}
    </button>
  )
}

export default function TVWatchlist() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') === 'favorites' ? 'favorites' : 'watchlist')

  const items = tab === 'favorites' ? (user?.favorites || []) : (user?.watchlist || [])

  // The whole page (tabs + grid) is one focus container. The first tab is the
  // deterministic navbar-RIGHT entry; LEFT from the tab bar returns to the
  // Watchlist navbar item.
  const content = useFocusContainer({
    id: 'watchlist',
    region: 'watchlist',
    preferredChildKey: 'watchlist-entry',
    exits: { left: 'navbar-watchlist' },
  })

  return (
    <div ref={content.ref} className="px-16 py-10 pb-16">
      <h1 className="text-3xl font-black mb-6">My List</h1>
      <TVContainerContext.Provider value="watchlist">
      <TVRegionContext.Provider value="watchlist">
        <div className="flex gap-4 mb-8">
          <Tab label={`Watchlist (${(user?.watchlist || []).length})`} active={tab === 'watchlist'} onClick={() => setTab('watchlist')} container="watchlist" focusKey="watchlist-entry" autoFocus />
          <Tab label={`Favorites (${(user?.favorites || []).length})`} active={tab === 'favorites'} onClick={() => setTab('favorites')} container="watchlist" />
        </div>

        {!user ? (
          <p className="text-lg text-white/50">Sign in to see your list.</p>
        ) : items.length === 0 ? (
          <p className="text-lg text-white/50">
            {tab === 'favorites' ? 'No favorites yet.' : 'Your watchlist is empty.'} Add titles from any anime page.
          </p>
        ) : (
          <div key={tab} className="grid gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--kx-card-w, 184px), 1fr))', columnGap: 'var(--kx-card-gap, 18px)' }}>
            {items.map((item, i) => (
              <TVAnimeCard
                key={`${item.animeId ?? item.id}-${i}`}
                anime={{
                  id: item.animeId ?? item.id,
                  title: item.title,
                  coverImage: item.coverImage,
                  coverImageSmall: item.coverImageSmall || item.coverImage,
                  episodes: item.episodes,
                  rating: item.rating,
                  releaseYear: item.releaseYear,
                }}
              />
            ))}
          </div>
        )}
      </TVRegionContext.Provider>
      </TVContainerContext.Provider>
    </div>
  )
}
