import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Home,
  Tv,
  Search as SearchIcon,
  Film,
  Save,
  Bookmark,
  Settings,
  LogIn,
} from 'lucide-react'
import { useFocusable, useFocusContainer } from '../TVFocusManager'

// The vertical Kaizen X TV navigation rail. UP/DOWN moves between items with
// edge-stay. RIGHT enters the corresponding page (deterministic, via per-node
// exit / onArrow), LEFT stays. Each item declares an `entry` — the focusKey
// (or container id) of its page's first focusable content — so RIGHT moves
// focus straight into that content (same-page node exit), while the route is
// only navigated to when coming from a different page.
const NAV = [
  { to: '/tv', label: 'Home', icon: Home, end: true, focusKey: 'navbar-home', entry: 'hero-watch' },
  { to: '/tv/search', label: 'Search', icon: SearchIcon, focusKey: 'navbar-search', entry: 'search-key-1' },
  { to: '/tv/movies', label: 'Movies', icon: Film, focusKey: 'navbar-movies', entry: 'catalog-movie' },
  { to: '/tv/tv', label: 'TV Series', icon: Tv, focusKey: 'navbar-tv-series', entry: 'catalog-tv' },
  { to: '/tv/watchlist?tab=favorites', label: 'Save', icon: Save, focusKey: 'navbar-save', entry: 'watchlist-entry' },
  { to: '/tv/watchlist', label: 'Watchlist', icon: Bookmark, focusKey: 'navbar-watchlist', entry: 'watchlist-entry' },
  { to: '/tv/settings', label: 'Settings', icon: Settings, focusKey: 'navbar-settings', entry: 'settings-category-0' },
  { to: '/tv/signup', label: 'Sign Up', icon: LogIn, focusKey: 'navbar-signup', entry: 'signup-name' },
]

function SideLink({ to, label, icon: Icon, end, focusKey, entry }) {
  const navigate = useNavigate()
  const location = useLocation()

  const focus = useFocusable({
    onSelect: () => navigate(to),
    focusKey,
    container: 'navbar',
    // Items with an `entry` (Home -> hero-watch, Sign Up -> signup-name)
    // declare a deterministic side exit: their target page content sits in
    // the same TV shell, so RIGHT can move focus straight into it. Other items
    // simply navigate to their route (they exit the navbar on their own).
    exit: entry ? { right: entry } : null,
    onArrow: entry
      ? (dir) => {
          if (dir !== 'right') return false
          // Already on this route (compare pathname only, so Save's
          // `?tab=favorites` still matches the watchlist page) -> let the focus
          // engine move straight into that page's content.
          if (location.pathname === to.split('?')[0]) return false
          navigate(to)
          return true
        }
      : (dir) => {
          if (dir !== 'right') return false
          navigate(to)
          return true
        },
  })

  return (
    <NavLink
      ref={focus.ref}
      to={to}
      end={end}
      onClick={() => navigate(to)}
      className={({ isActive }) => (isActive ? 'kx-side-item kx-side-active' : 'kx-side-item')}
      title={label}
      aria-label={label}
    >
      <Icon className="w-[22px] h-[22px] shrink-0" strokeWidth={2} />
      <span className="kx-side-label">{label}</span>
    </NavLink>
  )
}

export default function TVNavbar() {
  // The navbar is a vertical container. UP/DOWN move between its items; the
  // top/bottom edges stay (no container exit, no sibling -> "stay"). RIGHT is
  // handled per-item (see SideLink) and never leaks into page geometry.
  const navbar = useFocusContainer({
    id: 'navbar',
    region: 'navbar',
    preferredChildKey: 'navbar-home',
  })
  return (
    <aside ref={navbar.ref} className="kx-sidebar py-4 px-2.5" aria-label="Primary">
      <div className="h-12 flex items-center mb-3 justify-center xl:justify-start xl:px-2">
        <Logo />
      </div>

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {NAV.map(({ to, label, icon, end, focusKey, entry }) => (
          <SideLink key={focusKey} to={to} label={label} icon={icon} end={end} focusKey={focusKey} entry={entry} />
        ))}
      </nav>
    </aside>
  )
}

function Logo() {
  return (
    <Link to="/tv" tabIndex={-1} className="flex items-center gap-3 select-none shrink-0">
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', boxShadow: '0 6px 20px rgba(139,92,246,0.35)' }}
      >
        <span className="text-white font-black text-[14px] leading-none" style={{ fontFamily: 'Outfit' }}>KX</span>
      </span>
      <span className="leading-none kx-wordmark">
        <span className="block text-[17px] font-black tracking-[-0.02em] text-white" style={{ fontFamily: 'Outfit' }}>KAISEN X</span>
        <span className="block text-[9.5px] font-bold tracking-[0.22em] uppercase text-white/45 -mt-0.5">Anime TV</span>
      </span>
    </Link>
  )
}
