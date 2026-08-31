import { useAuth } from '../context/AuthContext'
import AnimeCard from '../components/ui/AnimeCard'
import { Bookmark, Heart } from 'lucide-react'

export default function MyList() {
  const { user } = useAuth()
  const watchlist = user?.watchlist || []
  const favorites = user?.favorites || []

  if (!user) {
    return (
      <div className="px-6 lg:px-10 py-24 text-center">
        <Bookmark className="w-12 h-12 mx-auto text-gray-600 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Your list lives here</h1>
        <p className="text-gray-500">Sign in to save anime to your watchlist and favorites.</p>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-10 space-y-14">
      <section>
        <h1 className="flex items-center gap-3 text-3xl font-black text-white mb-6" style={{ fontFamily: 'Outfit' }}>
          <span className="w-1.5 h-8 rounded-full bg-gradient-to-b from-accent-light to-primary" />
          My List
        </h1>

        <Section title="Watchlist" icon={Bookmark} items={watchlist} emptyText="Nothing saved yet — add anime from any card." />
        <div className="mt-12">
          <Section title="Favorites" icon={Heart} items={favorites} emptyText="No favorites yet — tap the heart on any card." />
        </div>
      </section>
    </div>
  )
}

function Section({ title, icon: Icon, items, emptyText }) {
  return (
    <div>
      <h2 className="flex items-center gap-2.5 text-lg sm:text-xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
        <Icon className="w-5 h-5 text-accent-light" strokeWidth={2.4} />
        {title}
        <span className="text-sm font-medium text-gray-500">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <div className="kx-panel px-6 py-10 text-center text-gray-500">{emptyText}</div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-6">
          {items.map((a) => (
            <AnimeCard key={(typeof a === 'object' ? a.id : a)} anime={typeof a === 'object' ? a : { id: a, title: 'Anime', coverImage: '' }} size="normal" />
          ))}
        </div>
      )}
    </div>
  )
}
