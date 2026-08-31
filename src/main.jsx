import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

// Android TV APK: the bundled UI must open the 10-foot interface directly.
// No-op in browsers (isNativePlatform() is false) and when already under /tv
// (e.g. dev server loaded at /tv). Runs before the router mounts, so no extra
// history entry is created and BACK still exits the app normally.
if (Capacitor.isNativePlatform()) {
  const p = window.location.pathname
  if (!p.startsWith('/tv')) {
    window.history.replaceState({}, '', '/tv')
  }

  // Keep the launch splash up for at least 2s after React boots so the
  // branding is actually visible, then fade into the UI. The native safety
  // timeout (launchShowDuration) covers the failure case where this never
  // runs.
  const hideSplash = () => SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {})
  const splashTimer = setTimeout(hideSplash, 2000)
  window.addEventListener('beforeunload', () => clearTimeout(splashTimer))
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
