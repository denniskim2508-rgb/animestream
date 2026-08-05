// Per-provider request statistics. Every outbound provider call records into
// this registry so the logs and a `/api/health/providers` snapshot can flag
// slow, unstable, 404/429/5xx providers instead of silently degrading.

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
    lastStatus: null,
    lastError: null,
    lastAt: null,
  }
}

// Record one provider request. `ok:false` covers any failure (timeout, network
// error, or non-2xx). `status` is the HTTP status when one was received.
export function record(name, { ms, ok = true, status = null, timeout = false, error = null } = {}) {
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
  if (status) s.lastStatus = status
  if (ok) return s
  s.failures++
  if (timeout) s.timeouts++
  if (status && status >= 400) s.httpErrors++
  s.lastError = error ? String(error).slice(0, 200) : status ? `HTTP ${status}` : 'error'
  return s
}

export function snapshot() {
  return [...entries.values()].map((s) => ({
    ...s,
    avgMs: s.calls ? Math.round(s.totalMs / s.calls) : 0,
    successRate: s.calls ? Math.round((1 - s.failures / s.calls) * 100) : 100,
  }))
}

// Human-oriented summary for the logs: ranked by average latency, plus lists of
// the providers that look unhealthy so ops can react without reading every line.
export function summarize() {
  const all = snapshot()
  const byAvg = [...all].sort((a, b) => b.avgMs - a.avgMs)
  const slowest = all.filter((s) => s.calls && s.slowestMs > 3000)
  const unstable = all.filter((s) => s.calls >= 3 && s.failures / s.calls > 0.25)
  const degraded = all.filter(
    (s) => s.lastStatus === 404 || s.lastStatus === 429 || (s.lastStatus != null && s.lastStatus >= 500),
  )
  return {
    totalCalls: all.reduce((n, s) => n + s.calls, 0),
    totalFailures: all.reduce((n, s) => n + s.failures, 0),
    byAvg,
    slowest,
    unstable,
    degraded,
  }
}

export function reset(name) {
  entries.delete(name)
}

export function resetAll() {
  entries.clear()
}
