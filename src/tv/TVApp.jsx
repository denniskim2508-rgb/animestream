import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { TVFocusProvider } from './TVFocusManager'
import { useAuth } from '../context/AuthContext'
import TVSplash from './components/TVSplash'
import TVNavbar from './components/TVNavbar'
import TVHome from './pages/TVHome'
import TVBrowse from './pages/TVBrowse'
import TVSearch from './pages/TVSearch'
import TVCatalog from './pages/TVCatalog'
import TVAnimeDetails from './pages/TVAnimeDetails'
import TVPlayer from './pages/TVPlayer'
import TVProfile from './pages/TVProfile'
import TVWatchlist from './pages/TVWatchlist'
import TVHistory from './pages/TVHistory'
import TVSettings from './pages/TVSettings'
import TVSignup from './pages/TVSignup'
import { Tv as TvIcon, Clapperboard } from 'lucide-react'
import { applyPosterSize, loadPosterSize } from './appearance'
import './tv.css'

// The 10-foot UI. Boots through a real initialization splash (Firebase auth
// restore + API health + first-payload prefetch), then runs an anime-focused,
// remote-first streaming shell.
export default function TVApp() {
  const { loading: authLoading } = useAuth()

  useEffect(() => {
    applyPosterSize(loadPosterSize())
  }, [])

  return (
    <TVSplash authReady={!authLoading}>
      <TVFocusProvider>
        <div className="tv-root">
          <TVNavbar />
          <div className="tv-page tv-page-kx">
            <Routes>
              <Route index element={<TVHome />} />
              <Route path="browse" element={<TVBrowse />} />
              <Route path="search" element={<TVSearch />} />
              <Route path="tv" element={<TVCatalog format="TV" title="TV Series" icon={TvIcon} />} />
              <Route path="movies" element={<TVCatalog format="MOVIE" title="Movies" icon={Clapperboard} />} />
              <Route path="anime/:animeId" element={<TVAnimeDetails />} />
              <Route path="watch/:animeId/:episode" element={<TVPlayer />} />
              <Route path="profile" element={<TVProfile />} />
              <Route path="watchlist" element={<TVWatchlist />} />
              <Route path="history" element={<TVHistory />} />
              <Route path="settings" element={<TVSettings />} />
              <Route path="signup" element={<TVSignup />} />
              <Route path="*" element={<Navigate to="/tv" replace />} />
            </Routes>
          </div>
        </div>
      </TVFocusProvider>
    </TVSplash>
  )
}
