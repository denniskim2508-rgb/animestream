import { Router } from 'express'
import dns from 'dns/promises'
import net from 'net'
import { fetchWithTimeout } from '../utils/http.js'
import { encodeHeaders, decodeHeaders } from '../providers/util.js'

const router = Router()

const PROXY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

// ── SSRF guard ─────────────────────────────────────────────────
// The proxy exists to relay media from public CDNs. Never fetch private,
// loopback, link-local, or reserved ranges (cloud metadata, internal hosts).
function ipIsBlocked(ip) {
  const addr = String(ip).replace(/^\[|\]$/g, '')
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || // 0/8, private 10/8, loopback
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) || // link-local 169.254/16 (cloud metadata)
      (a === 172 && b >= 16 && b <= 31) || // private 172.16/12
      (a === 192 && b === 168) || // private 192.168/16
      (a === 192 && b === 0) || // IETF reserved 192.0.0/24
      (a === 192 && b === 0 && addr === '192.0.2.0') || // TEST-NET-1
      (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18/15
      (a === 198 && b === 51) || // TEST-NET-2
      (a === 203 && b === 0) || // TEST-NET-3
      a >= 224 // multicast + reserved
    )
  }
  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase()
    return (
      lower === '::' || lower === '::1' ||
      lower.startsWith('fc') || lower.startsWith('fd') || // ULA fc00::/7
      lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb') || // link-local fe80::/10
      lower.startsWith('ff') // multicast
    )
  }
  return true
}

const DNS_CACHE_TTL_MS = 60_000
const resolvedCache = new Map() // host -> { blocked, at }

async function hostIsBlocked(host) {
  const cached = resolvedCache.get(host)
  if (cached && Date.now() - cached.at < DNS_CACHE_TTL_MS) return cached.blocked
  let blocked = true
  try {
    const records = await dns.lookup(host, { all: true })
    blocked = records.length === 0 || records.some((r) => ipIsBlocked(r.address))
  } catch {
    blocked = true // unresolvable -> deny
  }
  resolvedCache.set(host, { blocked, at: Date.now() })
  return blocked
}

async function urlIsBlocked(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return true
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return true
  const host = parsed.hostname
  if (host === 'localhost') return true
  if (net.isIP(host)) return ipIsBlocked(host)
  return hostIsBlocked(host)
}

const MAX_REDIRECTS = 5

// Fetch `url` enforcing the SSRF blocklist on every hop (redirects are checked
// before following, so a redirect to an internal host is denied).
async function safeFetch(url, providerHeaders, origin) {
  if (await urlIsBlocked(url)) {
    const err = new Error(`blocked url (non-public host): ${new URL(url).host}`)
    err.blocked = true
    throw err
  }

  const opts = {
    redirect: 'manual',
    headers: {
      'User-Agent': providerHeaders['User-Agent'] || PROXY_UA,
      'Referer': providerHeaders['Referer'] || providerHeaders.referer || origin,
      'Origin': providerHeaders.Origin || providerHeaders.origin || origin,
    },
  }

  let response = await fetchWithTimeout(url, opts, {
    provider: 'media-proxy', label: url.substring(0, 120), timeoutMs: 60000, retries: 0, allowNonOk: true, breaker: false,
  })

  let hops = 0
  while ([301, 302, 303, 307, 308].includes(response.status) && hops < MAX_REDIRECTS) {
    const loc = response.headers.get('location')
    if (!loc) break
    response.body?.cancel?.()
    const next = new URL(loc, url).href
    if (await urlIsBlocked(next)) {
      const err = new Error(`blocked redirect to non-public host: ${new URL(next).host}`)
      err.blocked = true
      throw err
    }
    response = await fetchWithTimeout(next, opts, {
      provider: 'media-proxy', label: next.substring(0, 120), timeoutMs: 60000, retries: 0, allowNonOk: true, breaker: false,
    })
    hops++
  }

  return response
}

function rewriteM3u8(content, baseUrl, encH) {
  return content.replace(/^(?!#)(.*\S)$/gm, (line) => {
    const target = line.startsWith('http://') || line.startsWith('https://')
      ? line
      : new URL(line, baseUrl).href
    return `/api/media/proxy?url=${encodeURIComponent(target)}&h=${encH}`
  })
}

// Media proxy for m3u8 + segments. Upstream segments can be large, so the cap
// is far above the provider API default; a hung upstream still aborts.
router.get('/media/proxy', async (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).send('url required')
  if (url.includes('/api/media/proxy?') || url.includes('/api/stream/proxy?')) {
    return res.status(400).send('proxy loop prevented')
  }

  const providerHeaders = decodeHeaders(req.query.h || '')
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).send('invalid url')
  }
  const origin = `${parsed.protocol}//${parsed.host}/`

  try {
    const response = await safeFetch(url, providerHeaders, origin)

    if (!response.ok) {
      console.error(`[media] proxy | ${url.substring(0, 120)} | upstream=${response.status}`)
      return res.status(response.status).send(`Upstream ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const isM3u8 = contentType.includes('mpegurl') || contentType.includes('m3u8') || url.includes('.m3u8')

    console.log(`[media] proxy | ${url.substring(0, 120)}... | upstream=${response.status} | ct=${contentType}`)

    if (isM3u8) {
      const text = await response.text()
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
      const encH = encodeHeaders(providerHeaders)
      const rewritten = rewriteM3u8(text, baseUrl, encH)
      res.set('Content-Type', 'application/vnd.apple.mpegurl')
      res.set('Access-Control-Allow-Origin', '*')
      return res.send(rewritten)
    }

    res.set('Content-Type', contentType)
    res.set('Access-Control-Allow-Origin', '*')
    if (response.headers.get('content-length')) {
      res.set('Content-Length', response.headers.get('content-length'))
    }
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error(`[media] proxy error | ${String(url || '').substring(0, 120)} | ${err.message}`)
    res.status(err.blocked ? 403 : 500).send(err.blocked ? 'Blocked' : 'Proxy error')
  }
})

export default router
