import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE } from '../../api/base'
import { fetchHomepageData } from '../../api/anilist'

/**
 * Real initialization gate:
 *  1. AuthContext finishes restoring Firebase session (`authReady`)
 *  2. Production API answers a lightweight health request
 *  3. First home payload is warm in the query cache (kicked off here so Home
 *     renders instantly after the fade)
 * Minimum display ~900ms purely for the logo animation; no artificial waits.
 */
export default function TVSplash({ authReady, children }) {
  const [phase, setPhase] = useState('boot') // boot | ready | error
  const [exit, setExit] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    setPhase('boot')
    ;(async () => {
      try {
        if (!authReady) throw Object.assign(new Error('auth'), { code: 'WAIT_AUTH' })
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 12000)
        const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal })
          .catch(() => fetch(`${API_BASE}/`, { signal: controller.signal }))
        clearTimeout(timer)
        if (!res) throw new Error('API unreachable')
        // Warm the first screen while the logo is still up.
        queryClient.prefetchQuery({
          queryKey: ['tv-home'],
          queryFn: () => fetchHomepageData(14),
          staleTime: 5 * 60 * 1000,
        }).catch(() => {})
        if (!cancelled) setPhase('ready')
      } catch (e) {
        if (cancelled) return
        if (e?.code === 'WAIT_AUTH') return // still restoring session — stay on splash
        setApiError(e?.message || 'Initialization failed')
        setPhase('error')
      }
    })()
    return () => { cancelled = true }
  }, [attempt, authReady, queryClient])

  useEffect(() => {
    if (phase !== 'ready') return undefined
    const minDisplay = setTimeout(() => {
      setExit(true)
      setTimeout(() => setPhase('done'), 480)
    }, 900)
    return () => clearTimeout(minDisplay)
  }, [phase])

  if (phase === 'done') return children

  return (
    <>
      <div style={{ visibility: phase === 'ready' ? 'visible' : 'hidden', height: '100vh', overflow: 'hidden' }}>
        {children}
      </div>
      <div
        className={`fixed inset-0 z-[100] tvx-boot-screen ${exit ? 'tvx-boot-exit' : ''}`}
        style={{ background: 'radial-gradient(900px 600px at 50% 30%, #101A30 0%, #070B14 60%)' }}
      >
        <div className="w-full h-full flex flex-col items-center justify-center gap-8">
          <div className="tvx-boot-logo flex flex-col items-center gap-5">
            <span className="tv-logo-mark w-24 h-24 rounded-3xl flex items-center justify-center text-4xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
              KX
            </span>
            <span className="tv-brand-text text-6xl font-black">KAISEN X</span>
            <p className="text-lg tracking-[0.35em] uppercase text-white/40 font-semibold -mt-2">Anime TV</p>
          </div>

          {phase === 'error' ? (
            <div className="flex flex-col items-center gap-5">
              <p className="text-xl text-red-300">Couldn't reach Kaisen X servers.</p>
              <p className="text-base text-white/45 max-w-md text-center">{apiError}</p>
              <button
                onClick={() => setAttempt((a) => a + 1)}
                className="tv-btn-primary rounded-xl px-9 py-3.5 text-lg font-bold"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="tvx-loader-track"><div className="tvx-loader-fill" /></div>
              <p className="text-base text-white/45 tracking-widest uppercase font-medium">
                {authReady ? 'Connecting…' : 'Starting up…'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
