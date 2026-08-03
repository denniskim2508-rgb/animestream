import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import * as manga from './server/providers/manga.js'
import { encodeHeaders, decodeHeaders } from './server/providers/util.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())

const ANIDAP_MAIN = 'https://anidap.lol'
const ANIDAP_CHAD = 'https://chad.anidap.lol'

const ANIDAP_HEADERS = {
  'Origin': 'https://anidap.lol',
  'Referer': 'https://anidap.lol/',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
}

async function anidapFetch(url) {
  const res = await fetch(url, { headers: ANIDAP_HEADERS })
  if (!res.ok) throw new Error(`Anidap API ${res.status}: ${res.statusText}`)
  return res.json()
}

// ── Anidap proxy endpoints ─────────────────────────────────────

app.get('/api/anidap/anime/:anilistId', async (req, res) => {
  try {
    const data = await anidapFetch(`${ANIDAP_MAIN}/api/anime/${req.params.anilistId}`)
    res.json(data)
  } catch (err) {
    console.error('[anidap] details error:', err.message)
    res.status(502).json({ error: 'Failed to fetch anime details' })
  }
})

app.get('/api/anidap/search', async (req, res) => {
  try {
    const q = req.query.q
    if (!q) return res.status(400).json({ error: 'q is required' })
    const data = await anidapFetch(`${ANIDAP_MAIN}/api/anime/search?q=${encodeURIComponent(q)}`)
    res.json(data)
  } catch (err) {
    console.error('[anidap] search error:', err.message)
    res.status(502).json({ error: 'Failed to search' })
  }
})

app.get('/api/anidap/episodes/:slug', async (req, res) => {
  try {
    const data = await anidapFetch(`${ANIDAP_CHAD}/rest/api/episodes?id=${req.params.slug}`)
    res.json(data)
  } catch (err) {
    console.error('[anidap] episodes error:', err.message)
    res.status(502).json({ error: 'Failed to fetch episodes' })
  }
})

app.get('/api/anidap/servers/:slug/:epNum', async (req, res) => {
  try {
    const data = await anidapFetch(
      `${ANIDAP_CHAD}/rest/api/servers?id=${req.params.slug}&epNum=${req.params.epNum}`
    )
    res.json(data)
  } catch (err) {
    console.error('[anidap] servers error:', err.message)
    res.status(502).json({ error: 'Failed to fetch servers' })
  }
})

app.get('/api/anidap/sources/:slug/:epNum/:type/:providerId', async (req, res) => {
  try {
    const { slug, epNum, type, providerId } = req.params
    const data = await anidapFetch(
      `${ANIDAP_CHAD}/rest/api/sources?id=${slug}&epNum=${epNum}&type=${type}&providerId=${providerId}`
    )
    res.json(data)
  } catch (err) {
    console.error('[anidap] sources error:', err.message)
    res.status(502).json({ error: 'Failed to fetch sources' })
  }
})

// ── High-level stream resolve ──────────────────────────────────

app.get('/api/anidap/recents', async (_req, res) => {
  try {
    const data = await anidapFetch(`${ANIDAP_MAIN}/api/anime/recents?limit=20`)
    const items = data?.data?.data || data?.data || []
    res.json(items)
  } catch (err) {
    console.error('[anidap] recents error:', err.message)
    res.status(502).json({ error: 'Failed to fetch recents' })
  }
})
// Takes anilistId + ep + type, finds slug, gets sources, returns m3u8

app.get('/api/stream/availability', async (req, res) => {
  const { anilistId, episode } = req.query
  if (!anilistId || !episode) {
    return res.status(400).json({ error: 'anilistId and episode are required' })
  }
  try {
    const details = await anidapFetch(`${ANIDAP_MAIN}/api/anime/${anilistId}`)
    const slug = details?.data?.id
    if (!slug) return res.json({ hasSub: false, hasDub: false })
    const servers = await anidapFetch(
      `${ANIDAP_CHAD}/rest/api/servers?id=${slug}&epNum=${Number(episode)}`
    )
    res.json({
      hasSub: !!(servers.subProviders?.length),
      hasDub: !!(servers.dubProviders?.length),
    })
  } catch (err) {
    console.error('[availability] Error:', err.message)
    res.json({ hasSub: false, hasDub: false })
  }
})

app.get('/api/stream/resolve', async (req, res) => {
  const { anilistId, episode, audio } = req.query
  if (!anilistId || !episode) {
    return res.status(400).json({ error: 'anilistId and episode are required' })
  }

  const type = audio || 'sub'
  const ep = Number(episode)

  try {
    const details = await anidapFetch(`${ANIDAP_MAIN}/api/anime/${anilistId}`)
    const slug = details?.data?.id
    if (!slug) throw new Error('Could not find anime slug')

    const servers = await anidapFetch(
      `${ANIDAP_CHAD}/rest/api/servers?id=${slug}&epNum=${ep}`
    )
    const allProviders = type === 'dub' ? servers.dubProviders : servers.subProviders
    if (!allProviders?.length) throw new Error(`No ${type} providers available`)

    const BLACKLIST = ['beep', 'sora']
    const providers = allProviders.filter(p => !BLACKLIST.includes(p.id))
    if (!providers.length) throw new Error(`No usable ${type} providers`)

    const defaultProvider = providers.find(p => p.id === 'kiwi') || providers.find(p => p.default) || providers[0]

    const sources = await anidapFetch(
      `${ANIDAP_CHAD}/rest/api/sources?id=${slug}&epNum=${ep}&type=${type}&providerId=${defaultProvider.id}`
    )

    if (!sources.sources?.length) throw new Error('No sources returned')

    const sourceUrl = sources.sources[0].url
    const cdnHeaders = sources.headers || {}

    const episodeTitle = details?.data?.title?.english
      || details?.data?.title?.romaji
      || `Episode ${ep}`

    const totalEpisodes = details?.data?.episodeCount || details?.data?.episodes || 0

    console.log(`[stream] ${slug} ep ${ep} ${type} via ${defaultProvider.id}: ${sourceUrl.substring(0, 80)}...`)

    res.json({
      url: sourceUrl,
      cdnHeaders,
      provider: defaultProvider.id,
      providers: providers.map(p => ({ id: p.id, tip: p.tip, default: p.default })),
      tracks: sources.tracks || [],
      chapters: sources.chapters || [],
      episodeTitle,
      totalEpisodes,
      slug,
      hasSub: !!(servers.subProviders?.length),
      hasDub: !!(servers.dubProviders?.length),
    })
  } catch (err) {
    console.error('[stream] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Provider fallback: try sources with different provider ─────
app.get('/api/stream/sources', async (req, res) => {
  const { slug, ep, type, providerId } = req.query
  if (!slug || !ep || !providerId) {
    return res.status(400).json({ error: 'slug, ep, and providerId are required' })
  }

  try {
    const data = await anidapFetch(
      `${ANIDAP_CHAD}/rest/api/sources?id=${slug}&epNum=${ep}&type=${type || 'sub'}&providerId=${providerId}`
    )
    res.json({
      sources: data.sources || [],
      headers: data.headers || {},
      tracks: data.tracks || [],
      chapters: data.chapters || [],
    })
  } catch (err) {
    console.error('[stream] sources error:', err.message)
    res.status(502).json({ error: 'Failed to fetch sources' })
  }
})

// ── Media proxy for m3u8 + segments ───────────────────────────

function rewriteM3u8(content, baseUrl, encH) {
  return content.replace(/^(?!#)(.*\S)$/gm, (line) => {
    const target = line.startsWith('http://') || line.startsWith('https://')
      ? line
      : new URL(line, baseUrl).href
    return `/api/media/proxy?url=${encodeURIComponent(target)}&h=${encH}`
  })
}

app.get('/api/media/proxy', async (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).send('url required')

  const providerHeaders = decodeHeaders(req.query.h || '')
  const parsed = new URL(url)
  const origin = `${parsed.protocol}//${parsed.host}/`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': providerHeaders['User-Agent']
          || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Referer': providerHeaders['Referer'] || providerHeaders.referer || origin,
        'Origin': providerHeaders.Origin || providerHeaders.origin || origin,
      },
    })

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

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Animestream server' })
})

// ── Manga Provider Manager ────────────────────────────────────
// All /api/manga/* routes go through the Provider Manager, which normalizes
// results and falls back across providers. The frontend only ever sees
// normalized shapes and opaque ids like "mangadex:<uuid>" / "allmanga:<ref>".

app.get('/api/manga/lookup', async (req, res) => {
  try {
    const titles = [].concat(req.query.titles || [])
      .map((s) => String(s).trim())
      .filter(Boolean)
    if (!titles.length) return res.status(400).json({ error: 'titles is required' })
    const strict = req.query.strict === '1'
    const { data, provider } = await manga.lookup(titles, strict)
    res.json({ data, provider })
  } catch (err) {
    console.error('[manga] lookup error:', err.message)
    res.status(502).json({ error: 'Failed to lookup manga' })
  }
})

app.get('/api/manga/search', async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query
    if (!q) return res.status(400).json({ error: 'q is required' })
    const { data, total, provider } = await manga.search(q, Number(limit), Number(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] search error:', err.message)
    res.status(502).json({ error: 'Failed to search manga' })
  }
})

app.get('/api/manga/trending', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const { data, total, provider } = await manga.trending(Number(limit), Number(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] trending error:', err.message)
    res.status(502).json({ error: 'Failed to fetch trending manga' })
  }
})

app.get('/api/manga/latest', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const { data, total, provider } = await manga.latest(Number(limit), Number(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] latest error:', err.message)
    res.status(502).json({ error: 'Failed to fetch latest manga' })
  }
})

app.get('/api/manga/random', async (_req, res) => {
  try {
    const { data, provider } = await manga.random()
    res.json({ data, provider })
  } catch (err) {
    console.error('[manga] random error:', err.message)
    res.status(502).json({ error: 'Failed to fetch random manga' })
  }
})

app.get('/api/manga/chapter/:id', async (req, res) => {
  try {
    const chapterId = req.params.id
    const { manga: mangaId, num } = req.query
    const pageData = await manga.pages(chapterId, {
      mangaId,
      chapterNum: num != null ? Number(num) : undefined,
    })
    const provider = pageData.provider || manga.splitId(chapterId).provider
    console.log(
      `[manga] chapter pages | id=${chapterId} | provider=${provider} | pages=${pageData.pages?.length ?? 0} | pagesSd=${pageData.pagesSd?.length ?? 0}`
    )
    for (const [i, u] of (pageData.pages || []).entries()) {
      console.log(`[manga]   page[${i}] ${u}`)
    }
    res.json(pageData)
  } catch (err) {
    console.error('[manga] chapter pages error:', err.message)
    res.status(502).json({ error: 'Failed to fetch chapter pages' })
  }
})

app.get('/api/manga/:id', async (req, res) => {
  try {
    const { data, provider } = await manga.detail(req.params.id)
    res.json({ data, provider })
  } catch (err) {
    console.error('[manga] details error:', err.message)
    res.status(502).json({ error: 'Failed to fetch manga details' })
  }
})

app.get('/api/manga/:id/chapters', async (req, res) => {
  try {
    const { lang = 'en', limit = 100, offset = 0 } = req.query
    const { data, total, provider } = await manga.chapters(req.params.id, lang, Number(limit), Number(offset))
    console.log(`[manga] chapters | mangaId=${req.params.id} | provider=${provider} | total=${total} | returned=${data.length}`)
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] chapters error:', err.message)
    res.status(502).json({ error: 'Failed to fetch chapters' })
  }
})

// ── Serve built frontend ──────────────────────────────────────
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message)
})
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled rejection:', err?.message || err)
})

const PORT = process.env.PORT || process.env.ANIWATCH_PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
