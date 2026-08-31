// fetch() wrapper used by every provider: hard request timeout, optional retry
// on 429/5xx, and per-provider stats + log lines (timestamp, method, provider,
// endpoint hostname, response time, success/failure, HTTP status, error). A
// hung provider now aborts after `timeoutMs` instead of blocking the whole
// request merge forever.
//
// An alternate transport (e.g. one with a browser-like TLS fingerprint for
// Cloudflare-gated upstreams) can be supplied as options.http; it must be
// fetch-shaped: (url, { headers, signal }) -> Response-like { ok, status, ... }.
//
// Logging rule: only provider name, endpoint hostname/path, method, status,
// timing, and error text are ever logged. Query strings (which can carry signed
// or provider-specific tokens) are stripped from logged endpoints, and no
// headers, cookies, or credentials are ever logged.

import { record } from './stats.js'

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_RETRIES = 1

// Circuit breaker: after BREAKER_THRESHOLD consecutive failures a provider is
// skipped entirely (fail-fast, ~0ms) for BREAKER_COOLDOWN_MS instead of burning
// the full timeout on every request. After the cooldown one probe request is
// let through; success resets the streak, a probe failure reopens the breaker.
// This keeps a flaky upstream (e.g. mangapill) from stalling every request that
// touches it while still recovering automatically once it comes back.
const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN_MS = 30_000
const breaker = new Map() // provider -> { streak, openedAt }

function breakerStatus(name) {
  const b = breaker.get(name)
  if (!b || b.streak < BREAKER_THRESHOLD) return { state: 'closed', streak: b?.streak || 0 }
  if (Date.now() < b.openedAt + BREAKER_COOLDOWN_MS) return { state: 'open', streak: b.streak }
  return { state: 'half-open', streak: b.streak }
}

function breakerFail(name) {
  const b = breaker.get(name) || { streak: 0, openedAt: 0 }
  b.streak++
  b.openedAt = Date.now()
  breaker.set(name, b)
}

function breakerSuccess(name) {
  breaker.delete(name)
}

function ts() {
  return new Date().toISOString()
}

// Logged endpoint = hostname + path only. Query strings may carry signed URLs /
// provider tokens, so they are stripped from every log line.
function loggedEndpoint(url) {
  try {
    const u = new URL(String(url || ''), 'http://localhost')
    return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    const s = String(url || '')
    return s.length > 100 ? `${s.slice(0, 97)}...` : s
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function buildSignal(userSignal, timeoutMs) {
  const { AbortSignal } = globalThis
  const timeoutSignal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : null
  if (timeoutSignal && userSignal) {
    return typeof AbortSignal.any === 'function' ? AbortSignal.any([timeoutSignal, userSignal]) : timeoutSignal
  }
  return timeoutSignal || userSignal || undefined
}

// Fetch `url` and never wait longer than `timeoutMs`. Non-2xx responses throw
// (after optional retries for 429/5xx); the upstream's own reply (truncated) is
// captured so the real reason is visible in stats, not just the status code.
// Every attempt is recorded in stats and logged.
export async function fetchWithTimeout(url, opts = {}, options = {}) {
  const {
    provider = 'unknown',
    label = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = 400,
    allowNonOk = false,
    breaker: useBreaker = true,
  } = options
  const endpoint = label || loggedEndpoint(url)
  const method = (opts.method || 'GET').toUpperCase()
  const doFetch = options.http || fetch
  let lastErr

  if (useBreaker && provider !== 'unknown') {
    const st = breakerStatus(provider)
    if (st.state === 'open') {
      const err = new Error(`${provider} circuit open (skipped after ${st.streak} failures)`)
      err.code = 'ECIRCUITOPEN'
      err.provider = provider
      record(provider, { ms: 0, ok: false, timeout: false, error: err.message, code: 'ECIRCUITOPEN' })
      console.log(`[http] ${ts()} ${method} ${provider} | ${endpoint} | SKIP (circuit open)`)
      throw err
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const attemptStart = Date.now()
    try {
      const res = await doFetch(url, { ...opts, signal: buildSignal(opts.signal, timeoutMs) })
      const ms = Date.now() - attemptStart
      if (!res.ok && !allowNonOk) {
        // Capture the upstream's own error body so e.g. AniList's real 403
        // outage message surfaces instead of a bare status code.
        let snippet = ''
        try {
          snippet = (await res.text()).replace(/\s+/g, ' ').slice(0, 160).trim()
        } catch { /* body unreadable, fall back to status text */ }
        const detail = snippet || res.statusText || ''
        record(provider, { ms, ok: false, status: res.status, error: detail, code: `HTTP ${res.status}` })
        console.log(`[http] ${ts()} ${method} ${provider} | ${endpoint} | HTTP ${res.status} in ${ms}ms | ${detail}`)
        const retriable = res.status === 429 || res.status >= 500
        if (retriable && attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1))
          continue
        }
        lastErr = new Error(`${provider} HTTP ${res.status}: ${detail || res.statusText}`)
        lastErr.code = `HTTP ${res.status}`
        if (useBreaker) breakerFail(provider)
        break // already recorded + logged; don't fall into the catch below
      }
      if (useBreaker) breakerSuccess(provider)
      record(provider, { ms, ok: true, status: res.status })
      console.log(`[http] ${ts()} ${method} ${provider} | ${endpoint} | HTTP ${res.status} in ${ms}ms`)
      return res
    } catch (err) {
      const ms = Date.now() - attemptStart
      const isTimeout = err?.name === 'TimeoutError' || /abort/i.test(err?.message || '')
      record(provider, { ms, ok: false, timeout: isTimeout, error: err.message, code: isTimeout ? 'ETIMEDOUT' : err?.code })
      console.log(`[http] ${ts()} ${method} ${provider} | ${endpoint} | ${isTimeout ? 'TIMEOUT' : 'FAIL'} in ${ms}ms | ${err.message}`)
      lastErr = err
      if (attempt < retries && !isTimeout && err?.name !== 'AbortError') {
        await sleep(retryDelayMs * (attempt + 1))
        continue
      }
      if (useBreaker) breakerFail(provider)
      if (isTimeout) {
        const timeoutErr = new Error(`${provider} timed out after ${timeoutMs}ms`)
        timeoutErr.code = 'ETIMEDOUT'
        timeoutErr.provider = provider
        throw timeoutErr
      }
      throw err
    }
  }

  throw lastErr || new Error(`${provider} request failed`)
}
