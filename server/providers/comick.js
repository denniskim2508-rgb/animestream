// ComicK adapter. ComicK is a scanlation aggregator with deep coverage of manhwa,
// webtoons and officially-licensed series that MangaDex lacks, so it rounds out
// the list merges and gives the pages fallback another source to read from.
//
// Transport note: Cloudflare challenges Node's default TLS fingerprint on the
// /comic/* and /chapter/* routes (the /v1.0/search route is left open), so all
// requests go through a custom https.Agent using a Chrome-like cipher suite and
// HTTP/1.1 ALPN — the same fingerprint curl presents. Requests still flow
// through fetchWithTimeout (stats, retries, circuit breaker), which accepts an
// alternate transport via the `http` option.

import https from 'node:https'
import { normalizeTitle, titleScore } from './util.js'
import { normalizeProvider } from './interface.js'
import { fetchWithTimeout } from '../utils/http.js'

const API = 'https://api.comick.dev'
const IMAGE = 'https://meo.comick.pictures'
const PROVIDER = 'comick'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// Order matches Chrome 120's TLS 1.2/1.3 suite list closely enough that the
// API's Cloudflare rules stop fingerprinting us as a script.
const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':')

const AGENT = new https.Agent({
  ciphers: CHROME_CIPHERS,
  honorCipherOrder: true,
  minVersion: 'TLSv1.2',
  ALPNProtocols: ['http/1.1'],
  ecdhCurve: 'X25519:secp256r1',
})

function toHeaders(obj) {
  const headers = new Headers()
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, String(x)))
    else headers.set(k, String(v))
  }
  return headers
}

// https.request transport shaped like fetch() so fetchWithTimeout can drive it
// (its stats/logging/retries/circuit-breaker logic stays untouched).
function comickHttp(url, opts = {}) {
  return new Promise((resolve, reject) => {
    let done = false
    const fail = (err) => {
      if (!done) {
        done = true
        reject(err)
      }
    }

    const req = https.get(
      url,
      {
        agent: AGENT,
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          Referer: 'https://comick.io/',
          'Accept-Encoding': 'identity',
          ...(opts.headers || {}),
        },
        timeout: opts.timeout || 12000,
      },
      (res) => {
        const chunks = []
        res.on('data', (d) => chunks.push(d))
        res.on('error', fail)
        res.on('end', () => {
          if (done) return
          done = true
          const body = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode || 0
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage || '',
            headers: toHeaders(res.headers),
            text: async () => body,
            json: async () => JSON.parse(body),
          })
        })
      }
    )
    req.on('timeout', () => fail(Object.assign(new Error('ComicK request timed out'), { name: 'TimeoutError' })))
    req.on('error', (e) => {
      if (opts.signal?.aborted) {
        const reason = opts.signal.reason
        const name = reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError'
        fail(Object.assign(new Error(reason?.message || 'aborted'), { name }))
      } else {
        fail(e)
      }
    })
    if (opts.signal) {
      if (opts.signal.aborted) {
        req.destroy(opts.signal.reason)
        return
      }
      opts.signal.addEventListener('abort', () => req.destroy(opts.signal.reason), { once: true })
    }
  })
}

async function comickGet(path, params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const q = qs.toString()
  const url = `${API}${path}${q ? `?${q}` : ''}`

  // Cloudflare applies its bot challenge to the guarded routes probabilistically
  // — a request can 403 once and succeed on the next try. Retry 403s a couple of
  // times before surfacing the error (fetchWithTimeout's own retries only cover
  // 429/5xx).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        { headers: {} },
        { provider: PROVIDER, http: comickHttp, timeoutMs: 10000, retries: 1, retryDelayMs: 600 }
      )
      return res.json()
    } catch (err) {
      if (err.code === 'HTTP 403' && attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error('ComicK request failed')
}

function imageUrl(b2key) {
  if (!b2key) return null
  return `${IMAGE}/${String(b2key).replace(/^\/+/, '')}`
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ComicK `status` is an int; the values line up with the interface's strings.
const STATUS = { 1: 'ongoing', 2: 'completed', 3: 'hiatus', 4: 'cancelled' }

function extractTitle(m) {
  if (m.title) return m.title
  const titles = Array.isArray(m.md_titles) ? m.md_titles : []
  const preferred = titles.find((t) => t.is_default && t.lang === 'en') || titles.find((t) => t.lang === 'en')
  return preferred?.title || titles[0]?.title || 'Untitled'
}

function extractTags(m) {
  // Search items carry numeric genre ids (not resolvable without a lookup call);
  // detail carries full genre objects under md_comic_md_genres.
  const genres = Array.isArray(m.md_comic_md_genres) ? m.md_comic_md_genres : []
  return [...new Set(genres.map((g) => g.md_genres?.name).filter(Boolean))]
}

function mapManga(m, ref) {
  const title = extractTitle(m)
  const altTitles = [...new Set((m.md_titles || []).map((t) => t.title).filter(Boolean))]
    .filter((t) => t !== title)
    .slice(0, 30)
  return {
    id: `${PROVIDER}:${ref || m.hid}`,
    title,
    altTitles,
    description: m.desc || '',
    coverImage: imageUrl(m.md_covers?.[0]?.b2key) || m.cover_url || null,
    author: m.artists?.[0]?.name || null,
    artist: null,
    status: STATUS[m.status] || 'unknown',
    year: m.year || null,
    tags: extractTags(m),
    rating: toNum(m.bayesian_rating),
    followedCount: toNum(m.user_follow_count) || 0,
    demographic: null,
    originalLanguage: null,
    chapterNumbersResetOnNewVolume: m.chapter_numbers_reset_on_new_volume || false,
    provider: PROVIDER,
  }
}

// ComicK keeps one entry per scanlation group, so the same chapter number can
// appear many times. The reader renders a flat list, so collapse duplicates to
// a single best entry (most votes wins) instead of showing repeated rows.
function dedupeChapters(chs) {
  const best = new Map()
  const unnumbered = []
  for (const ch of chs) {
    if (ch.chap == null || ch.chap === '') {
      unnumbered.push(ch)
      continue
    }
    const cur = best.get(String(ch.chap))
    if (!cur || toNum(ch.up_count) > toNum(cur.up_count)) best.set(String(ch.chap), ch)
  }
  return [...best.values(), ...unnumbered]
}

function mapChapters(chs) {
  return chs.map((ch) => ({
    id: `${PROVIDER}:${ch.hid}`,
    chapter: ch.chap != null && ch.chap !== '' ? parseFloat(ch.chap) : null,
    title: ch.title || '',
    volume: ch.vol != null ? parseFloat(ch.vol) : null,
    lang: ch.lang || 'en',
    pages: 0,
    publishedAt: ch.publish_at || ch.created_at || null,
    group:
      (ch.group_name || []).join(', ') ||
      ch.md_chapters_groups?.[0]?.md_groups?.title ||
      null,
  }))
}

// Deduped chapter lists are expensive to assemble (they require paging through
// every raw chapter), so cache them per (manga, lang) for a few minutes. The
// manager keeps its own page-slice cache, but its full-list re-fetch would
// otherwise re-page the API for every paginated request.
const listCache = new Map()
const LIST_CACHE_TTL = 10 * 60 * 1000
const LIST_CACHE_MAX = 300
const RAW_PAGE_SIZE = 500
const RAW_PAGE_MAX = 40

function listKey(hid, lang) {
  return `${hid}:${lang}`
}

function getCachedList(key) {
  const entry = listCache.get(key)
  if (!entry || Date.now() > entry.exp) return null
  return entry.items
}

function setCachedList(key, items) {
  if (listCache.size >= LIST_CACHE_MAX) listCache.delete(listCache.keys().next().value)
  listCache.set(key, { items, exp: Date.now() + LIST_CACHE_TTL })
}

async function fetchRawChapters(hid, lang) {
  const all = []
  for (let page = 1; page <= RAW_PAGE_MAX; page++) {
    const data = await comickGet(`/comic/${hid}/chapters`, { lang, limit: RAW_PAGE_SIZE, page, 'chap-order': 1 })
    const batch = Array.isArray(data?.chapters) ? data.chapters : []
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < RAW_PAGE_SIZE) break
  }
  return all
}

async function getChapterList(hid, lang) {
  const key = listKey(hid, lang)
  let items = getCachedList(key)
  if (!items) {
    items = dedupeChapters(await fetchRawChapters(hid, lang))
    setCachedList(key, items)
  }
  return items
}

const SEARCH_PARAMS = { tachiyomi: true, type: 'comic' }

export async function search(query, limit = 20, offset = 0) {
  const per = Math.min(limit, 50)
  const data = await comickGet('/v1.0/search/', {
    ...SEARCH_PARAMS,
    q: query,
    limit: per,
    page: Math.floor(offset / per) + 1,
  })
  const items = (Array.isArray(data) ? data : []).map((m) => mapManga(m))
  return { data: items, total: offset + items.length }
}

async function rankedList(sort, limit, offset) {
  const per = Math.min(limit, 50)
  const data = await comickGet('/v1.0/search/', {
    ...SEARCH_PARAMS,
    sort,
    limit: per,
    page: Math.floor(offset / per) + 1,
  })
  const items = (Array.isArray(data) ? data : []).map((m) => mapManga(m))
  return { data: items, total: offset + items.length }
}

export async function trending(limit = 20, offset = 0) {
  return rankedList('view', limit, offset)
}

export async function latest(limit = 20, offset = 0) {
  return rankedList('uploaded', limit, offset)
}

export async function random() {
  const page = 1 + Math.floor(Math.random() * 10)
  const data = await comickGet('/v1.0/search/', { ...SEARCH_PARAMS, sort: 'rating', limit: 50, page })
  const list = Array.isArray(data) ? data : []
  if (!list.length) throw new Error('ComicK: empty random pool')
  return { data: mapManga(list[Math.floor(Math.random() * list.length)]) }
}

export async function lookup(candidates, strict = false) {
  let best = null
  let bestScore = 0
  const seen = new Set()

  for (const query of candidates) {
    const norm = normalizeTitle(query)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)

    let data
    try {
      data = await comickGet('/v1.0/search/', { ...SEARCH_PARAMS, q: query, limit: 50 })
    } catch {
      continue
    }

    for (const m of Array.isArray(data) ? data : []) {
      const primaryScore = Math.max(0, titleScore(query, m.title || ''))
      const altScore = Math.max(
        0,
        ...(m.md_titles || []).map((t) => titleScore(query, t.title || ''))
      )
      let score
      if (primaryScore === 100) {
        score = 110
      } else if (strict) {
        score = 0
      } else {
        score = Math.max(primaryScore, altScore)
      }
      if (score > bestScore) {
        bestScore = score
        best = m
      }
    }

    if (bestScore >= 110) break
  }

  return bestScore >= (strict ? 110 : 90) ? mapManga(best) : null
}

export async function detail(ref) {
  const data = await comickGet(`/comic/${ref}`)
  if (!data?.comic) throw new Error(`ComicK: comic ${ref} not found`)
  return { data: mapManga({ ...data.comic, artists: data.artists }, ref) }
}

export async function chapters(ref, lang = 'en', limit = 100, offset = 0) {
  const items = await getChapterList(ref, lang)
  return { data: mapChapters(items.slice(offset, offset + limit)), total: items.length }
}

export async function pages(ref) {
  const data = await comickGet(`/chapter/${ref}`)
  const images = Array.isArray(data?.chapter?.md_images) ? data.chapter.md_images : []
  return {
    pages: images.map((i) => imageUrl(i.b2key)).filter(Boolean),
    pagesSd: [],
    hash: null,
    baseUrl: null,
  }
}

// Resolve a chapter's number from its id so the manager's pages fallback can
// match it against other providers when ComicK serves no readable images.
export async function chapterNumber(ref) {
  const data = await comickGet(`/chapter/${ref}`)
  const chap = data?.chapter?.chap
  if (chap == null || chap === '') return null
  return parseFloat(chap)
}

export const provider = normalizeProvider('comick', {
  search,
  detail,
  chapters,
  pages,
  trending,
  latest,
  random,
  lookup,
})
