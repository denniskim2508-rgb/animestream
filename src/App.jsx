import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import AppShell from './components/layout/AppShell'
import Home from './pages/Home'
import Browse from './pages/Browse'
import GenresIndex from './pages/GenresIndex'
import GenrePage from './pages/GenrePage'
import AnimeDetail from './pages/AnimeDetail'
import VideoPlayer from './pages/VideoPlayer'
import SearchPage from './pages/Search'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import Profile from './pages/Profile'
import About from './pages/About'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'
import DMCA from './pages/DMCA'
import HelpCenter from './pages/HelpCenter'
import MangaHome from './pages/MangaHome'
import MangaDetail from './pages/MangaDetail'
import MangaReader from './pages/MangaReader'
import MangaSearch from './pages/MangaSearch'
import AdminProviders from './pages/AdminProviders'
import Movies from './pages/Movies'
import MyList from './pages/MyList'
import History from './pages/History'
import TVApp from './tv/TVApp'
import { TVFocusProvider } from './tv/TVFocusManager'

export default function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-kx-bg flex items-center justify-center">
        <div className="text-4xl font-black" style={{ fontFamily: 'Outfit', letterSpacing: '-0.03em' }}>
          <span className="bg-gradient-to-r from-accent-light to-primary-light bg-clip-text text-transparent">KAISEN</span>
          <span className="text-white">X</span>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<AppShell><Home /></AppShell>} />
      <Route path="/home" element={<AppShell><Home /></AppShell>} />
      <Route path="/browse" element={<AppShell><Browse /></AppShell>} />
      <Route path="/movies" element={<AppShell><Movies /></AppShell>} />
      <Route path="/genres" element={<AppShell><GenresIndex /></AppShell>} />
      <Route path="/genres/:genreId" element={<AppShell><GenrePage /></AppShell>} />
      <Route path="/anime/:id" element={<AppShell><AnimeDetail /></AppShell>} />
      <Route path="/watch/:animeId/:episode" element={<VideoPlayer />} />
      <Route path="/search" element={<AppShell><SearchPage /></AppShell>} />
      <Route path="/login" element={<TVFocusProvider><Login /></TVFocusProvider>} />
      <Route path="/signup" element={<TVFocusProvider><Signup /></TVFocusProvider>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/profile" element={<AppShell><Profile /></AppShell>} />
      <Route path="/my-list" element={<AppShell><MyList /></AppShell>} />
      <Route path="/history" element={<AppShell><History /></AppShell>} />
      <Route path="/about" element={<AppShell><About /></AppShell>} />
      <Route path="/notifications" element={<AppShell><Notifications /></AppShell>} />
      <Route path="/settings" element={<AppShell><Settings /></AppShell>} />
      <Route path="/terms" element={<AppShell><TermsOfService /></AppShell>} />
      <Route path="/privacy" element={<AppShell><PrivacyPolicy /></AppShell>} />
      <Route path="/dmca" element={<AppShell><DMCA /></AppShell>} />
      <Route path="/help" element={<AppShell><HelpCenter /></AppShell>} />
      <Route path="/manga" element={<AppShell><MangaHome /></AppShell>} />
      <Route path="/manga/search" element={<AppShell><MangaSearch /></AppShell>} />
      <Route path="/manga/:id" element={<AppShell><MangaDetail /></AppShell>} />
      <Route path="/manga/:id/read/:chapterId" element={<MangaReader />} />
      <Route path="/admin/providers" element={<AppShell><AdminProviders /></AppShell>} />

      {/* ── Android TV / 10-foot UI ── */}
      <Route path="/tv/*" element={<TVApp />} />
    </Routes>
  )
}
