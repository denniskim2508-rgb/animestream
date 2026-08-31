// Single source of truth for the backend origin used by every /api call.
//
// Resolution order:
//   1. Build-time env var   VITE_API_BASE_URL   (baked into the bundle)
//   2. Runtime global       window.__KAISEN_API_BASE__ (set before app boot,
//                           e.g. by a native shell or a test harness)
//   3. '' (empty)           same-origin relative paths — the website behavior
//
// The desktop/mobile site never sets either value and keeps calling `/api/...`
// exactly as before. The Android TV APK sets VITE_API_BASE_URL when building
// its web assets so the bundled UI can reach the deployed backend.
// Trailing slashes are stripped so concatenation is always safe.

const envBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || ''
const runtimeBase = (typeof window !== 'undefined' && window.__KAISEN_API_BASE__) || ''

export const API_BASE = String(envBase || runtimeBase || '').replace(/\/+$/, '')

/** Prefix a root-relative API path with the configured base. */
export function apiUrl(path) {
  return `${API_BASE}${path}`
}

// ── Bundled-mode API failure logging ────────────────────────────────────────
// When a remote backend origin is configured (Android TV APK), wrap window.fetch
// so every failed request to it logs the full URL, HTTP status, response error,
// and network/CORS failures with a greppable prefix. The website (API_BASE '')
// is completely unaffected.

if (API_BASE && typeof window !== 'undefined' && !window.__KAISEN_FETCH_PATCHED__) {
  window.__KAISEN_FETCH_PATCHED__ = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (...args) => {
    const [input, init] = args
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url

    let res
    try {
      res = await originalFetch(...args)
    } catch (err) {
      const kind = err instanceof TypeError ? 'network/CORS failure' : 'request failure'
      console.error(`[KAISEN-API] ${kind}: ${url}`, {
        method: init?.method || 'GET',
        error: String(err),
      })
      throw err
    }

    if (!res.ok) {
      let body = ''
      try { body = (await res.clone().text()).slice(0, 300) } catch { /* unreadable body */ }
      console.error(`[KAISEN-API] HTTP ${res.status} ${res.statusText}: ${url}`, {
        method: init?.method || 'GET',
        response: body || '(empty body)',
      })
    }

    return res
  }
}
