// fetch() wrapper used by every provider: hard request timeout, optional retry
// on 429/5xx, and per-provider stats + log lines (provider, endpoint, response
// time, success/failure, HTTP status). A hung provider now aborts after
// `timeoutMs` instead of blocking the whole request merge forever.

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

function shortUrl(url) {
  const s = String(url || '')
  return s.length > 100 ? `${s.slice(0, 97)}...` : s
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
// (after optional retries for 429/5xx); every attempt is recorded in stats and
// logged with the provider name, endpoint, response time, and outcome.
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
  const endpoint = label || shortUrl(url)
  let lastErr

  if (useBreaker && provider !== 'unknown') {
    const st = breakerStatus(provider)
    if (st.state === 'open') {
      const err = new Error(`${provider} circuit open (skipped after ${st.streak} failures)`)
      err.code = 'ECIRCUITOPEN'
      err.provider = provider
      record(provider, { ms: 0, ok: false, timeout: false, error: err.message })
      console.log(`[http] ${provider} | ${endpoint} | SKIP (circuit open)`)
      throw err
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const attemptStart = Date.now()
    try {
      const res = await fetch(url, { ...opts, signal: buildSignal(opts.signal, timeoutMs) })
      const ms = Date.now() - attemptStart
      if (!res.ok && !allowNonOk) {
        record(provider, { ms, ok: false, status: res.status, error: res.statusText })
        console.log(`[http] ${provider} | ${endpoint} | HTTP ${res.status} in ${ms}ms`)
        const retriable = res.status === 429 || res.status >= 500
        if (retriable && attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1))
          continue
        }
        lastErr = new Error(`${provider} HTTP ${res.status}: ${res.statusText}`)
        if (useBreaker) breakerFail(provider)
        throw lastErr
      }
      if (useBreaker) breakerSuccess(provider)
      record(provider, { ms, ok: true, status: res.status })
      console.log(`[http] ${provider} | ${endpoint} | 200 in ${ms}ms`)
      return res
    } catch (err) {
      const ms = Date.now() - attemptStart
      const isTimeout = err?.name === 'TimeoutError' || /abort/i.test(err?.message || '')
      record(provider, { ms, ok: false, timeout: isTimeout, error: err.message })
      console.log(`[http] ${provider} | ${endpoint} | ${isTimeout ? 'TIMEOUT' : 'FAIL'} in ${ms}ms | ${err.message}`)
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
