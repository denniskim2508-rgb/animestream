import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Home, Tv, Search as SearchIcon, Film, Bookmark, History as HistoryIcon,
  Settings, User, Bell, Menu, X, LogIn,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/browse', label: 'TV Series', icon: Tv },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/my-list', label: 'My List', icon: Bookmark },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Logo({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-3 select-none shrink-0">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', boxShadow: '0 6px 20px rgba(139,92,246,0.35)' }}>
        <span className="text-white font-black text-[14px] leading-none" style={{ fontFamily: 'Outfit' }}>KX</span>
      </span>
      {!compact && (
        <span className="leading-none kx-wordmark">
          <span className="block text-[17px] font-black tracking-[-0.02em] text-white" style={{ fontFamily: 'Outfit' }}>KAISEN X</span>
          <span className="block text-[9.5px] font-bold tracking-[0.22em] text-white/45 -mt-0.5">ANIME TV</span>
        </span>
      )}
    </Link>
  )
}

function SideLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => isActive ? 'kx-side-item kx-side-active' : 'kx-side-item'} title={label}>
      <Icon className="w-[22px] h-[22px] shrink-0" strokeWidth={2} />
      <span className="kx-side-label">{label}</span>
    </NavLink>
  )
}

export default function AppShell({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="min-h-screen bg-kx-bg">
      {/* ── Left sidebar (tablet rail / desktop full) ── */}
      <aside className="kx-sidebar py-4 px-2.5">
        <div className={`h-12 flex items-center mb-3 ${'justify-center xl:justify-start xl:px-2'}`}>
          <Logo />
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {NAV.map(({ to, label, icon, end }) => (
            <SideLink key={to} to={to} label={label} icon={icon} end={end} />
          ))}
        </nav>

        {/* Account slot pinned to the bottom — separate section from Settings.
            Same authenticated profile the whole site uses (AuthContext). */}
        <div className="pt-3 mt-2 border-t border-white/[0.06]">
          {user ? (
            <Link to="/profile" className="kx-side-item kx-acct-item" aria-label={`${user.name || 'User'} — open profile`}>
              <img
                src={user.avatar}
                alt=""
                className="w-11 h-11 rounded-full object-cover shrink-0 kx-avatar-ring"
                onError={(e) => {
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent((user.name || 'U').slice(0, 2))}&background=7c3aed&color=fff&size=128`
                }}
              />
              {/* Username is revealed only while hovered/focused. */}
              <span className="kx-acct-name">{user.name || 'User'}</span>
            </Link>
          ) : (
            <Link to="/login" className="kx-side-item text-white/60 hover:text-white">
              <LogIn className="w-[22px] h-[22px] shrink-0" strokeWidth={2} />
              <span className="kx-side-label">Sign In</span>
            </Link>
          )}
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="kx-main">
        {/* Slim top bar */}
        <header className="kx-topbar">
          <button
            className="p-2 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/10 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="md:hidden flex items-center">
            <Logo compact />
          </div>

          {/* Clean top area: no search input, no profile box — just the bell.
              Search lives in the sidebar; the avatar lives at the sidebar's bottom. */}
          <div className="flex items-center gap-2 ml-auto">
            <Link to="/notifications" aria-label="Notifications" className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10">
              <Bell className="w-5 h-5" />
            </Link>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-white/[0.06] mt-16 kx-shell-padding py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/35">
            <Logo />
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link to="/about" className="hover:text-white/60 transition-colors">About</Link>
              <Link to="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
              <Link to="/dmca" className="hover:text-white/60 transition-colors">DMCA</Link>
              <Link to="/help" className="hover:text-white/60 transition-colors">Help Center</Link>
            </div>
            <p>© {new Date().getFullYear()} Kaisen X</p>
          </div>
        </footer>
      </div>

      {/* ── Mobile slide-over drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0C1220] border-r border-white/10 flex flex-col animate-[dropdownIn_200ms_ease-out]">
            <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
              <Logo />
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setDrawerOpen(false)}
                  style={({ isActive }) => isActive
                    ? { background: 'rgba(139,92,246,0.14)', borderColor: 'rgba(139,92,246,0.35)' }
                    : undefined}
                  className={({ isActive }) => `flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-semibold transition-colors ${isActive ? 'text-white border' : 'text-white/55 hover:text-white hover:bg-white/[0.04]'}`}
                >
                  <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
                  {label}
                </NavLink>
              ))}
              <div className="border-t border-white/5 mt-3 pt-3">
                <NavLink to="/profile" onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) => `flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-semibold ${isActive ? 'bg-white/[0.06] text-white' : 'text-white/55'}`}>
                  <User className="w-5 h-5" /> Profile
                </NavLink>
                {!user && (
                  <NavLink to="/login" onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-semibold text-white/55">
                    <LogIn className="w-5 h-5" /> Sign In
                  </NavLink>
                )}
              </div>
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
