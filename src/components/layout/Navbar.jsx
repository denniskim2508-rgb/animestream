import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Search, Bell, Menu, X, User, ChevronDown, LogOut, Settings, Crown, Film, Play, List, Download, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const navLinks = [
  { path: '/about', label: 'About' },
  { path: '/', label: 'Home' },
  { path: '/browse', label: 'Browse' },
  { path: '/genres', label: 'Genres' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const { user, logout, audioMode, setAudioMode, unreadCount } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setProfileOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!profileOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setProfileOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [profileOpen])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
      setSearchOpen(false)
    }
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'glass shadow-lg shadow-black/20' : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Film className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight hidden sm:block">
                <span className="text-gradient">Kaisen</span>
                <span className="text-white"> X Anime</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.path
                      ? 'text-white bg-white/10'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <form
              onSubmit={handleSearch}
              className={`transition-all duration-300 overflow-hidden ${
                searchOpen ? 'w-64 sm:w-80' : 'w-0'
              }`}
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search anime..."
                  autoFocus={searchOpen}
                  className="w-full pl-9 pr-4 py-2 bg-white/10 border border-white/10 rounded-full text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                />
              </div>
            </form>

            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>

            <button
              onClick={() => setAudioMode(audioMode === 'sub' ? 'dub' : 'sub')}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all ${
                audioMode === 'sub'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
                  : 'bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30'
              }`}
            >
              {audioMode === 'sub' ? 'JP Sub' : 'EN Dub'}
            </button>

            {user && (
              <Link
                to="/notifications"
                className="relative p-2 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-anime-red text-white text-[10px] font-bold rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            )}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 p-1 rounded-full hover:bg-white/10 transition-colors"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/50"
                    onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=U&background=E01B24&color=fff&size=64' }}
                  />
                  <ChevronDown className={`w-4 h-4 text-gray-300 hidden sm:block transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div
                      className="absolute right-0 top-full mt-2 z-50 overflow-hidden"
                      style={{
                        width: 260,
                        background: '#1E293B',
                        border: '1px solid rgba(255,255,255,.08)',
                        borderRadius: 14,
                        boxShadow: '0 12px 35px rgba(0,0,0,.35)',
                        backdropFilter: 'blur(12px)',
                        animation: 'dropdownIn 250ms ease-out',
                      }}
                    >
                      <div className="px-4 py-3.5 flex items-center gap-3 border-b border-white/[0.06]">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/40"
                          onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=U&background=E01B24&color=fff&size=64' }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                          <p className="text-xs text-gray-400 truncate">{user.email}</p>
                          <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-[1px] text-[10px] font-bold uppercase rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/25">
                            <Crown className="w-2.5 h-2.5" /> {user.plan}
                          </span>
                        </div>
                      </div>

                      <nav className="py-1.5">
                        {[
                          { icon: User, label: 'Profile', to: '/profile' },
                          { icon: Play, label: 'Continue Watching', to: '/profile?tab=continue' },
                          { icon: List, label: 'Watch List', to: '/profile?tab=watchlist' },
                          { icon: Bell, label: 'Notifications', to: '/notifications' },
                          { icon: Download, label: 'List Import', action: () => { setImportOpen(true); setProfileOpen(false) } },
                          { icon: RefreshCw, label: 'AniList Sync', action: () => { setSyncOpen(true); setProfileOpen(false) } },
                        ].map((item) => (
                          item.to ? (
                            <Link
                              key={item.label}
                              to={item.to}
                              className="flex items-center gap-3 h-12 px-4 text-[13px] font-medium text-[#CBD5E1] hover:text-white hover:bg-white/[0.06] transition-colors duration-200"
                            >
                              <item.icon className="w-[18px] h-[18px]" />
                              {item.label}
                            </Link>
                          ) : (
                            <button
                              key={item.label}
                              onClick={item.action}
                              className="flex items-center gap-3 w-full h-12 px-4 text-[13px] font-medium text-[#CBD5E1] hover:text-white hover:bg-white/[0.06] transition-colors duration-200"
                            >
                              <item.icon className="w-[18px] h-[18px]" />
                              {item.label}
                            </button>
                          )
                        ))}
                      </nav>

                      <div className="border-t border-white/[0.06] pt-1.5 pb-1.5">
                        <Link
                          to="/settings"
                          className="flex items-center gap-3 h-12 px-4 text-[13px] font-medium text-[#CBD5E1] hover:text-white hover:bg-white/[0.06] transition-colors duration-200"
                        >
                          <Settings className="w-[18px] h-[18px]" />
                          Settings
                        </Link>
                        <button
                          onClick={() => { logout(); navigate('/') }}
                          className="flex items-center gap-3 w-full h-12 px-4 text-[13px] font-medium text-[#EF4444] hover:bg-[rgba(239,68,68,0.12)] transition-colors duration-200"
                        >
                          <LogOut className="w-[18px] h-[18px]" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary-dark text-white rounded-full transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-colors md:hidden"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-white/10 mt-2 pt-3">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.path
                    ? 'text-white bg-white/10'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {!user && (
              <div className="flex gap-2 mt-3 px-4">
                <Link to="/login" className="flex-1 py-2.5 text-center text-sm font-medium text-gray-300 border border-white/20 rounded-lg hover:bg-white/5 transition-colors">
                  Sign In
                </Link>
                <Link to="/signup" className="flex-1 py-2.5 text-center text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">
                  Sign Up
                </Link>
              </div>
            )}
            <button
              onClick={() => setAudioMode(audioMode === 'sub' ? 'dub' : 'sub')}
              className={`mx-4 mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all w-[calc(100%-2rem)] justify-center ${
                audioMode === 'sub'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
              }`}
            >
              {audioMode === 'sub' ? 'JP Sub' : 'EN Dub'}
            </button>
          </div>
        )}
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setImportOpen(false)}>
          <div
            className="w-full max-w-md mx-4 p-6 rounded-2xl border border-white/10"
            style={{ background: '#1E293B', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Download className="w-5 h-5 text-primary-light" /> List Import</h3>
              <button onClick={() => setImportOpen(false)} className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">Import your watch list from MAL, AniList, or Kitsu.</p>
            <input type="text" placeholder="Paste your list URL here..." className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4" />
            <button className="w-full py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors">Import</button>
          </div>
        </div>
      )}

      {syncOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSyncOpen(false)}>
          <div
            className="w-full max-w-md mx-4 p-6 rounded-2xl border border-white/10"
            style={{ background: '#1E293B', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><RefreshCw className="w-5 h-5 text-primary-light" /> AniList Sync</h3>
              <button onClick={() => setSyncOpen(false)} className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">Connect your AniList account to sync your watch history and scores.</p>
            <button className="w-full py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors">Connect AniList</button>
          </div>
        </div>
      )}
    </nav>
  )
}
