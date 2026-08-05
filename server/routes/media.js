import { Router } from 'express'
import { fetchWithTimeout } from '../utils/http.js'
import { encodeHeaders, decodeHeaders } from '../providers/util.js'

const router = Router()

const PROXY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

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
  const parsed = new URL(url)
  const origin = `${parsed.protocol}//${parsed.host}/`

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': providerHeaders['User-Agent'] || PROXY_UA,
          'Referer': providerHeaders['Referer'] || providerHeaders.referer || origin,
          'Origin': providerHeaders.Origin || providerHeaders.origin || origin,
        },
      },
      { provider: 'media-proxy', label: url.substring(0, 120), timeoutMs: 60000, retries: 0, allowNonOk: true, breaker: false }
    )

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
    res.status(500).send('Proxy error')
  }
})

export default router
