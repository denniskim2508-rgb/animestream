// Per-provider request statistics. Every outbound provider call records into
// this registry so the logs and a `/api/health/providers` snapshot can flag
// slow, unstable, 403/429/5xx/timeout providers instead of silently degrading.
//
// Each provider is classified into one of:
//   healthy      — requests succeed, latency under HEALTH_SLOW_MS
//   degraded     — succeeds but slow, or a flaky success rate
//   unhealthy    — genuinely unavailable / consistently failing
//   forbidden    — upstream answered HTTP 403 (e.g. AniList outage mode /
//                  config rejection) — distinct from a generic outage
//   rate_limited — HTTP 429
//   server_error — HTTP 5xx
//   timeout      — requests exceeded the configured timeout
//   none         — no requests yet
//
// Definitive HTTP signals (403/429/5xx) and timeouts classify immediately;
// latency/failure-rate judgement only applies once a provider has enough
// samples (HEALTH_MIN_CALLS) so a handful of requests can't produce misleading
// statistics. Thresholds are env-configurable and default to the project's
// established conventions (1500ms "slow", 5000ms "critical").

const int = (v, d) => { const n = parseInt(process.env[v], 10); return Number.isFinite(n) && n > 0 ? n : d }

const HEALTH_SLOW_MS = int('HEALTH_SLOW_MS', 1500)
const HEALTH_CRITICAL_MS = int('HEALTH_CRITICAL_MS', 5000)
const HEALTH_MIN_CALLS = int('HEALTH_MIN_CALLS', 3)
const HEALTH_RATE_DEGRADED = int('HEALTH_RATE_DEGRADED', 97)
const HEALTH_RATE_CRITICAL = int('HEALTH_RATE_CRITICAL', 90)

const entries = new Map()

function make(name) {
  return {
    name,
    calls: 0,
    failures: 0,
    timeouts: 0,
    httpErrors: 0,
    totalMs: 0,
    slowestMs: 0,
    lastMs: 0,
    lastOk: null,
    lastStatus: null,
    lastErrorCode: null,
    lastError: null,
    lastAt: null,
  }
}

// Record one provider request. `ok:false` covers any failure (timeout, network
// error, or non-2xx). `status` is the HTTP status when one was received.
// `code` is a stable error code (HTTP 403, ETIMEDOUT, ECIRCUITOPEN, ...) and
// `error` the human message (may include the upstream's own reply).
export function record(name, { ms, ok = true, status = null, timeout = false, error = null, code = null } = {}) {
  let s = entries.get(name)
  if (!s) {
    s = make(name)
    entries.set(name, s)
  }
  s.calls++
  s.totalMs += ms
  s.lastMs = ms
  s.lastAt = new Date().toISOString()
  if (ms > s.slowestMs) s.slowestMs = ms
  s.lastOk = !!ok
  if (status) s.lastStatus = status
  if (code) s.lastErrorCode = code
  if (ok) return s
  s.failures++
  if (timeout) s.timeouts++
  if (status && status >= 400) s.httpErrors++
  s.lastError = error ? String(error).slice(0, 200) : status ? `HTTP ${status}` : 'error'
  return s
}

function successRateOf(s) {
  return s.calls ? (1 - s.failures / s.calls) * 100 : 100
}

// Classify a provider's current health from its accumulated stats. Status-first:
// a 403/429/5xx or timeout answers definitively no matter how few samples exist.
export function classify(s) {
  if (!s || !s.calls) return 'none'
  if (s.lastStatus === 403) return 'forbidden'
  if (s.lastStatus === 429) return 'rate_limited'
  if (s.lastStatus != null && s.lastStatus >= 500) return 'server_error'
  if (s.lastErrorCode === 'ETIMEDOUT' || (s.timeouts > 0 && s.timeouts === s.calls)) return 'timeout'
  if (s.calls < HEALTH_MIN_CALLS) return 'healthy'
  const rate = successRateOf(s)
  if (rate < HEALTH_RATE_CRITICAL || s.avgMs >= HEALTH_CRITICAL_MS || s.timeouts / s.calls > 0.2) return 'unhealthy'
  if (rate < HEALTH_RATE_DEGRADED || s.avgMs >= HEALTH_SLOW_MS) return 'degraded'
  return 'healthy'
}

// Short human line for the current class (composed per-provider in the UI).
export const CLASS_LABEL = {
  healthy: 'Healthy',
  degraded: 'Slow / flaky',
  unhealthy: 'Unhealthy',
  forbidden: 'Forbidden',
  rate_limited: 'Rate limited',
  server_error: 'Server error',
  timeout: 'Timed out',
  none: 'No data yet',
}

export function snapshot() {
  return [...entries.values()].map((s) => {
    const entry = {
      ...s,
      avgMs: s.calls ? Math.round(s.totalMs / s.calls) : 0,
      successRate: successRateOf(s),
    }
    entry.class = classify(entry)
    entry.diagnostic = CLASS_LABEL[entry.class]
    return entry
  })
}

// Human-oriented summary for the logs and the dashboard "Attention needed" box.
export function summarize() {
  const all = snapshot()
  const byAvg = [...all].sort((a, b) => b.avgMs - a.avgMs)
  const attention = all.filter((s) => s.calls && !['healthy', 'none'].includes(s.class))
  const degraded = attention.filter((s) => ['degraded', 'rate_limited'].includes(s.class))
  const unstable = attention.filter((s) => ['unhealthy', 'timeout'].includes(s.class))
  const forbidden = attention.filter((s) => s.class === 'forbidden')
  const serverError = attention.filter((s) => s.class === 'server_error')
  const slowest = all.filter((s) => s.calls && s.slowestMs > 3000)
  return {
    totalCalls: all.reduce((n, s) => n + s.calls, 0),
    totalFailures: all.reduce((n, s) => n + s.failures, 0),
    byAvg,
    slowest,
    unstable,
    degraded,
    forbidden,
    serverError,
    attention,
  }
}

export function reset(name) {
  entries.delete(name)
}

export function resetAll() {
  entries.clear()
}
