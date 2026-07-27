import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
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
import { SkeletonPage } from './components/ui/Skeleton'

function PageLoader() {
  return <SkeletonPage />
}

function Layout({ children }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  )
}

export default function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  if (loading) return <PageLoader />

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <About />
          </Layout>
        }
      />
      <Route
        path="/home"
        element={
          <Layout>
            <Home />
          </Layout>
        }
      />
      <Route
        path="/browse"
        element={
          <Layout>
            <Browse />
          </Layout>
        }
      />
      <Route
        path="/genres"
        element={
          <Layout>
            <GenresIndex />
          </Layout>
        }
      />
      <Route
        path="/genres/:genreId"
        element={
          <Layout>
            <GenrePage />
          </Layout>
        }
      />
      <Route
        path="/anime/:id"
        element={
          <Layout>
            <AnimeDetail />
          </Layout>
        }
      />
      <Route path="/watch/:animeId/:episode" element={<VideoPlayer />} />
      <Route
        path="/search"
        element={
          <Layout>
            <SearchPage />
          </Layout>
        }
      />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/profile"
        element={
          <Layout>
            <Profile />
          </Layout>
        }
      />
      <Route
        path="/about"
        element={
          <Layout>
            <About />
          </Layout>
        }
      />
      <Route
        path="/notifications"
        element={
          <Layout>
            <Notifications />
          </Layout>
        }
      />
      <Route
        path="/settings"
        element={
          <Layout>
            <Settings />
          </Layout>
        }
      />
      <Route
        path="/terms"
        element={
          <Layout>
            <TermsOfService />
          </Layout>
        }
      />
      <Route
        path="/privacy"
        element={
          <Layout>
            <PrivacyPolicy />
          </Layout>
        }
      />

    </Routes>
  )
}
