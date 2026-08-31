import { useNavigate } from 'react-router-dom'
import { Bookmark, Heart, Clock, Settings as SettingsIcon, LogOut, LogIn, Play } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFocusable } from '../TVFocusManager'

function Tile({ icon: Icon, label, value, onClick, autoFocus = false }) {
  const focus = useFocusable({ onSelect: onClick, autoFocus })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      className="tv-card flex items-center gap-5 rounded-2xl bg-[#161B2E] border border-white/10 px-8 py-6 text-left w-full"
    >
      <span className="w-14 h-14 rounded-xl bg-[var(--color-primary-dark)]/60 flex items-center justify-center shrink-0">
        <Icon className="w-7 h-7" />
      </span>
      <span className="flex-1">
        <span className="block text-xl font-bold">{label}</span>
        {value != null && <span className="block text-base text-white/50 mt-0.5">{value}</span>}
      </span>
    </button>
  )
}

export default function TVProfile() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <h1 className="text-3xl font-black mb-3">You're browsing as a guest</h1>
        <p className="text-lg text-white/50 mb-10">Sign in to sync your watchlist, favorites and progress.</p>
        <Tile icon={LogIn} label="Sign In" onClick={() => navigate('/login')} autoFocus />
      </div>
    )
  }

  const cwCount = (user.continueWatching || []).length
  return (
    <div className="px-16 py-10 pb-16 max-w-5xl mx-auto">
      <div className="flex items-center gap-8 mb-12">
        <span className="w-28 h-28 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-5xl font-black shrink-0">
          {typeof user.avatar === 'string' && user.avatar.length <= 4 ? user.avatar : (user.name || 'U')[0]?.toUpperCase()}
        </span>
        <div>
          <h1 className="text-4xl font-black">{user.name}</h1>
          <p className="text-lg text-white/50 mt-1">{user.email}</p>
          <span className="inline-block mt-2 rounded-full bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/40 px-4 py-0.5 text-base font-bold uppercase tracking-wide text-[var(--color-primary-light)]">
            {user.plan || 'free'} plan
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Tile icon={Bookmark} label="My Watchlist" value={`${(user.watchlist || []).length} titles`} onClick={() => navigate('/tv/watchlist')} />
        <Tile icon={Heart} label="Favorites" value={`${(user.favorites || []).length} titles`} onClick={() => navigate('/tv/watchlist?tab=favorites')} />
        <Tile icon={Clock} label="Watch Time" value={`${Math.round((user.watchMinutes || 0) / 60)} hours · ${cwCount} in progress`} onClick={() => navigate('/tv')} />
        <Tile icon={Play} label="Sub / Dub watched" value={`${user.subWatchCount || 0} sub · ${user.dubWatchCount || 0} dub`} onClick={() => navigate('/tv')} />
        <Tile icon={SettingsIcon} label="Settings" onClick={() => navigate('/tv/settings')} />
        <Tile icon={LogOut} label="Sign Out" onClick={() => logout()} />
      </div>
    </div>
  )
}
