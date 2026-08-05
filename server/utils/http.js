// fetch() wrapper used by every provider: hard request timeout, optional retry
// on 429/5xx, and per-provider stats + log lines (provider, endpoint, response
// time, success/failure, HTTP status). A hung provider now aborts after
// `timeoutMs` instead of blocking the whole request merge forever.

import { record } from './stats.js'

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_RETRIES = 1

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
  } = options
  const endpoint = label || shortUrl(url)
  let lastErr

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
        throw lastErr
      }
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
