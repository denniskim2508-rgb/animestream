import { Link, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { AVATAR_CHARACTERS } from '../data/avatars'
import { getStatusLabel } from '../data/mockData'
import { BADGES } from '../data/badges'
import { Crown, Calendar, Film, Heart, Clock, ListChecks, Settings, Play, X, Check, Trash2, Award } from 'lucide-react'
import ContinueWatchingCard from '../components/ui/ContinueWatchingCard'

function CollectionCard({ item, onRemove }) {
  const id = typeof item === 'object' ? item.id : item
  const title = typeof item === 'object' ? item.title : `Anime #${id}`
  const coverImage = typeof item === 'object' ? item.coverImage : null
  const episodes = typeof item === 'object' ? item.episodes : null
  const status = typeof item === 'object' ? item.status : null

  return (
    <Link to={`/anime/${id}`} className="group block">
      <div className="bg-surface rounded-xl border border-white/5 overflow-hidden hover:border-white/15 transition-all">
        <div className="aspect-[3/4] overflow-hidden relative">
          {coverImage ? (
            <img src={coverImage} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <span className="text-gray-600 text-sm">No Image</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(id) }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
          >
            <Trash2 className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <div className="p-3">
          <h3 className="text-sm font-semibold text-white truncate group-hover:text-primary-light transition-colors">{title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {episodes > 0 && <span className="text-xs text-gray-400">{episodes} eps</span>}
            {status && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                status === 'RELEASING' ? 'bg-green-400/20 text-green-400'
                : status === 'FINISHED' ? 'bg-blue-400/20 text-blue-400'
                : 'bg-gray-500/20 text-gray-400'
              }`}>
                {getStatusLabel(status)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function Profile() {
  const { user, setAvatar, removeContinueWatching, toggleFavorite, toggleWatchlist } = useAuth()
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)

  if (!user) return <Navigate to="/login" replace />

  const handleSelectAvatar = (char) => {
    setAvatar(char.image, char.name)
    setShowAvatarPicker(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-white/5 p-6 sm:p-8 mb-10">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group cursor-pointer" onClick={() => setShowAvatarPicker(true)}>
            <img
              src={user.avatar}
              alt={user.name}
              className="w-24 h-24 rounded-2xl object-cover ring-4 ring-primary/30"
              onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=U&background=E01B24&color=fff&size=128' }}
            />
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Crown className="w-4 h-4 text-white" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-xs font-semibold text-white">Change</span>
            </div>
          </div>
          <div className="text-center sm:text-left flex-1">
            <h1 className="text-2xl font-bold text-white">{user.name}</h1>
            <p className="text-gray-400 text-sm">{user.email}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary-light border border-primary/30">
                <Crown className="w-3 h-3" /> {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}
              </span>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Joined {user.joinDate}
              </span>
            </div>
            {user.avatarName && (
              <p className="text-xs text-gray-600 mt-1">
                Avatar: {user.avatarName}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAvatarPicker(true)}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {[
            { icon: Film, label: 'Watched', value: (user.continueWatching || []).length, color: 'text-accent' },
            { icon: Heart, label: 'Favorites', value: (user.favorites || []).length, color: 'text-anime-red' },
            { icon: ListChecks, label: 'Watchlist', value: (user.watchlist || []).length, color: 'text-primary-light' },
            { icon: Clock, label: 'Hours', value: Math.round((user.watchMinutes || 0) / 60 * 10) / 10 || 0, color: 'text-anime-orange' },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface rounded-xl border border-white/5 p-4 text-center">
            <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} />
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {(user.badges || []).length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-anime-orange" /> Achievement Badges
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Object.entries(BADGES).map(([id, badge]) => {
              const earned = (user.badges || []).includes(id)
              return (
                <div key={id} className={`rounded-xl border p-4 text-center transition-all ${earned ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.01] border-white/5 opacity-40'}`}>
                  <span className="text-2xl block mb-1">{badge.icon}</span>
                  <p className="text-xs font-semibold text-white">{badge.name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{badge.description}</p>
                  {earned && <span className="inline-block mt-1.5 text-[10px] font-bold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">Earned</span>}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {(user.continueWatching || []).length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-primary-light" /> Continue Watching ({(user.continueWatching || []).length})
          </h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {(user.continueWatching || []).map((item) => (
              <ContinueWatchingCard
                key={`${item.animeId}-${item.episode}`}
                item={item}
                onRemove={removeContinueWatching}
              />
            ))}
          </div>
        </section>
      )}

      {(user.favorites || []).length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Heart className="w-5 h-5 text-anime-red" /> Favorites ({(user.favorites || []).length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {(user.favorites || []).map((item) => {
              const id = typeof item === 'object' ? item.id : item
              return <CollectionCard key={id} item={item} onRemove={toggleFavorite} />
            })}
          </div>
        </section>
      )}

      {(user.watchlist || []).length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary-light" /> My Watchlist ({(user.watchlist || []).length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {(user.watchlist || []).map((item) => {
              const id = typeof item === 'object' ? item.id : item
              return <CollectionCard key={id} item={item} onRemove={toggleWatchlist} />
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold text-white mb-4">Discover More</h2>
        <p className="text-sm text-gray-500 mb-4">Browse trending anime and add them to your collections.</p>
        <Link
          to="/browse"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-full transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-95"
        >
          Browse Anime
        </Link>
      </section>

      {showAvatarPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAvatarPicker(false)} />
          <div className="relative bg-gray-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Choose Your Avatar</h3>
              <button
                onClick={() => setShowAvatarPicker(false)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(80vh-80px)]">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {AVATAR_CHARACTERS.map((char) => (
                  <button
                    key={char.id}
                    onClick={() => handleSelectAvatar(char)}
                    className="group relative rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all"
                  >
                    <div className="aspect-square">
                      <img
                        src={char.image}
                        alt={char.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=7c3aed&color=fff&size=128`
                        }}
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] font-semibold text-white truncate">{char.name}</p>
                      <p className="text-[8px] text-gray-400 truncate">{char.anime}</p>
                    </div>
                    {user.avatar === char.image && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
