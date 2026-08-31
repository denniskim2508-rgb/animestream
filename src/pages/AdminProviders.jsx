import { useEffect, useRef, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  Wifi,
  Server,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../api/base'

const PROVIDER_NAMES = {
  mangadex: 'MangaDex',
  mangapill: 'MangaPill',
  allmanga: 'AllManga',
  asurascans: 'AsuraScans',
  atsu: 'Atsu',
  kitsu: 'Kitsu',
  anidap: 'AniDap',
  anilist: 'AniList',
  'media-proxy': 'Media Proxy',
}

// Metadata-only providers (Kitsu has no reader) get a neutral badge instead of
// a health color — slow lookup times there don't affect the reader.
const METADATA_ONLY = new Set(['kitsu'])

function providerLabel(name) {
  return PROVIDER_NAMES[name] || name.charAt(0).toUpperCase() + name.slice(1)
}

function successRateOf(p) {
  if (!p.calls) return null
  return (1 - p.failures / p.calls) * 100
}

// Server-side classification is the single source of truth (stats.js `class`),
// so threshold tweaks stay in one place. Kitsu still reads as a neutral
// "metadata only" badge when healthy since it has no reader.
function statusOf(p) {
  if (p.class) {
    if (METADATA_ONLY.has(p.name) && p.class === 'healthy') return 'meta'
    return p.class
  }
  // Legacy fallback for older servers that don't send `class` yet.
  if (!p.calls) return 'none'
  const rate = successRateOf(p)
  if (rate < 90 || p.avgMs >= 5000 || (p.calls >= 4 && p.timeouts / p.calls > 0.2)) return 'unhealthy'
  if (rate < 97 || p.avgMs >= 1500) return 'degraded'
  return METADATA_ONLY.has(p.name) ? 'meta' : 'healthy'
}

const STATUS_ORDER = { healthy: 0, meta: 1, degraded: 2, rate_limited: 3, unhealthy: 4, server_error: 5, forbidden: 6, timeout: 7, none: 8 }

const STATUS_META = {
  healthy: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'border-emerald-500/25', label: 'Healthy', bar: 'bg-emerald-400' },
  meta: { icon: Server, color: 'text-sky-400', bg: 'bg-sky-500/10', ring: 'border-sky-500/25', label: 'Metadata only', bar: 'bg-sky-400' },
  degraded: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'border-amber-500/25', label: 'Slow / flaky', bar: 'bg-amber-400' },
  rate_limited: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'border-orange-500/25', label: 'Rate limited', bar: 'bg-orange-400' },
  unhealthy: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'border-red-500/25', label: 'Unhealthy', bar: 'bg-red-400' },
  server_error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'border-red-500/25', label: 'Server error', bar: 'bg-red-400' },
  forbidden: { icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'border-red-500/40', label: 'Forbidden', bar: 'bg-red-400' },
  timeout: { icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'border-red-500/25', label: 'Timed out', bar: 'bg-red-400' },
  none: { icon: Wifi, color: 'text-gray-500', bg: 'bg-white/5', ring: 'border-white/10', label: 'No data yet', bar: 'bg-sky-400' },
}

function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function fmtPct(n) {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

function fmtClock(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function statTile({ label, value, sub }) {
  return (
    <div className="flex-1 min-w-[110px]">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function ProviderCard({ p }) {
  const status = statusOf(p)
  const meta = STATUS_META[status]
  const Icon = meta.icon
  const maxMs = Math.max(p.avgMs || 0, 1)
  const timeBar = Math.min((maxMs / 6000) * 100, 100)
  const rate = successRateOf(p)

  return (
    <div className={`p-5 rounded-2xl border bg-white/[0.03] ${meta.ring} transition-colors`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`shrink-0 w-11 h-11 rounded-xl ${meta.bg} flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">{providerLabel(p.name)}</h3>
            {status === 'meta' && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/25">
                Metadata only
              </span>
            )}
          </div>
          <p className={`text-xs font-medium ${meta.color}`}>{meta.label}</p>
        </div>
        <span className="text-[11px] text-gray-500 shrink-0">last {fmtClock(p.lastAt)}</span>
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        {statTile({ label: 'Avg response', value: fmtMs(p.avgMs) })}
        {statTile({ label: 'Success rate', value: fmtPct(rate), sub: `${p.calls} calls` })}
        {statTile({ label: 'Last response', value: fmtMs(p.lastMs), sub: `slowest ${fmtMs(p.slowestMs)}` })}
        {statTile({ label: 'Timeouts', value: p.timeouts || 0 })}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-1">
          <span>Success rate</span>
          <span>{fmtPct(rate)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full ${meta.bar}`}
            style={{ width: `${Math.max(rate || 0, 2)}%` }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-1">
          <span>Avg response vs 6s cap</span>
          <span>{fmtMs(p.avgMs)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full ${maxMs >= 5000 ? 'bg-red-400' : maxMs >= 1500 ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${timeBar}%` }}
          />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-gray-500 space-y-0.5">
        <p className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 shrink-0" />
          status: {p.lastStatus != null ? `HTTP ${p.lastStatus}` : '—'}
          {p.lastErrorCode && ` · ${p.lastErrorCode}`}
          {p.failures > 0 && ` · ${p.failures} failures`}
        </p>
        {p.lastError && (
          <p className="flex items-center gap-1.5 text-red-400/90 truncate" title={p.lastError}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {p.lastError}
          </p>
        )}
      </div>
    </div>
  )
}

export default function AdminProviders() {
  const { user, isAdmin, loading } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [probing, setProbing] = useState(false)
  const [probeResult, setProbeResult] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const pollRef = useRef(null)

  const load = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`${API_BASE}/api/health/providers`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  // Force a live AniList check so a fix can be verified without waiting for
  // organic traffic. The probe records into the same stats, then returns the
  // fresh snapshot so the dashboard updates in one round-trip.
  const runProbe = async () => {
    setProbing(true)
    setProbeResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/health/providers/probe`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setProbeResult([json.probe])
      setData(json)
      setLastUpdated(new Date())
    } catch (err) {
      setProbeResult([{ provider: 'anilist', ok: false, ms: 0, error: err.message }])
    } finally {
      setProbing(false)
    }
  }

  useEffect(() => {
    if (loading || !user || !isAdmin) return
    load()
    if (!autoRefresh) return
    pollRef.current = setInterval(load, 5000)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.uid, isAdmin, autoRefresh])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[720px] mx-auto">
        <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.03] text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Access denied</h1>
          <p className="text-sm text-gray-400 mb-6">This dashboard is restricted to administrators.</p>
          <Link
            to="/home"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-full transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const providers = [...(data?.providers || [])].sort((a, b) => {
    const s = STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)]
    return s !== 0 ? s : (a.avgMs || 0) - (b.avgMs || 0)
  })
  const summary = data?.summary
  const attention = summary?.attention?.length || 0

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1100px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Link to="/home" className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            Provider Health
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {data ? (
              <>
                {summary?.totalCalls || 0} provider calls · {summary?.totalFailures || 0} failures · last updated {lastUpdated?.toLocaleTimeString()}
              </>
            ) : 'Collecting provider telemetry…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runProbe}
            disabled={probing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-lg transition-colors disabled:opacity-50"
            title="Send a live request to AniList and record the result"
          >
            <Activity className={`w-3.5 h-3.5 ${probing ? 'animate-pulse' : ''}`} />
            {probing ? 'Probing…' : 'Probe AniList'}
          </button>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              autoRefresh ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25' : 'bg-white/5 text-gray-400 border border-white/10'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            Live {autoRefresh ? '5s' : 'off'}
          </button>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/25 bg-red-500/10 text-sm text-red-300">
          Failed to load provider stats: {error}
        </div>
      )}

      {probeResult && (
        <div className={`mb-6 p-4 rounded-xl border ${probeResult.some((r) => !r.ok) ? 'border-red-500/25 bg-red-500/10' : 'border-emerald-500/25 bg-emerald-500/10'}`}>
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Live probe
          </p>
          <ul className="mt-1 text-sm text-gray-300 space-y-0.5">
            {probeResult.map((r) => (
              <li key={r.provider}>
                · {providerLabel(r.provider)} —{' '}
                {r.ok ? (
                  <span className="text-emerald-300">reachable in {fmtMs(r.ms)}</span>
                ) : (
                  <span className="text-red-300">failed after {fmtMs(r.ms)} — {r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {attention > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-amber-500/25 bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Attention needed
          </p>
          <ul className="mt-1 text-sm text-amber-200/80 space-y-0.5">
            {summary.attention.map((p) => (
              <li key={p.name}>
                · {providerLabel(p.name)} — {p.diagnostic}
                {p.lastStatus != null ? ` · HTTP ${p.lastStatus}` : ''}
                {p.lastError ? ` · ${p.lastError}` : p.calls ? ` · ${p.failures}/${p.calls} requests failing` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!data ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-400 mb-2">Waiting for data</h2>
          <p className="text-sm text-gray-600">Stats appear as soon as the app makes its first provider requests.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map((p) => (
            <ProviderCard key={p.name} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}
