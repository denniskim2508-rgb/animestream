// LunarX adapter. LunarX (lunarx.to) is a manga/manhwa aggregator with deep,
// well-curated manhwa/webtoon coverage and a fast open JSON API (api3.lunarx.to)
// that doesn't sit behind a Cloudflare bot challenge. It is wired in as a
// catalog-only provider: it powers search results, trending/latest lists, title
// lookup and chapter discovery, but its page-reading flow (session-key
// validation on the reader API) is not implemented here, so pages() throws and
// the manager falls back to a readable provider — the same role Kitsu plays for
// cross-linking.
//
// Notes on the API:
//   - Search returns full metadata: GET /api/manga/search?query=..&page=..&limit=..
//     -> { manga: [..], total, total_pages, page, limit }
//   - The chapter list endpoint (GET /api/manga/:slug) returns chapters only —
//     no manga metadata — so detail() resolves metadata by searching the
//     slug-derived title phrase and matching the exact slug (or a titleScore hit).
//   - Chapter ids embed the numeric chapter as `chapter-<n>` so the manager's
//     pages fallback can resolve the chapter number from the id alone
//     (deriveChapterNum) when the reader falls through to another provider.

import { titleScore } from './util.js'
import { normalizeProvider } from './interface.js'
import { fetchWithTimeout } from '../utils/http.js'

const API = 'https://api3.lunarx.to'
const PROVIDER = 'lunarx'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function api(path) {
  const res = await fetchWithTimeout(
    API + path,
    { headers: { Accept: 'application/json', 'User-Agent': UA, Referer: 'https://lunarx.to/' } },
    { provider: PROVIDER, timeoutMs: 12000 }
  )
  return res.json()
}

// Several metadata fields arrive as JSON-encoded strings (genres, themes,
// alternative_titles); tolerate both string and array forms.
function parseJsonArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v !== 'string' || !v.trim()) return []
  try {
    const p = JSON.parse(v)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

const STATUS = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  'on hiatus': 'hiatus',
  cancelled: 'cancelled',
  dropped: 'cancelled',
  upcoming: 'upcoming',
}

function mapStatus(v) {
  if (!v) return 'unknown'
  const k = String(v).toLowerCase().trim()
  return STATUS[k] || 'unknown'
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function mapManga(m) {
  const title = String(m.title || '').trim()
  const altTitles = [...new Set(parseJsonArray(m.alternative_titles).map((t) => String(t).trim()).filter(Boolean))]
    .filter((t) => t !== title)
    .slice(0, 30)
  return {
    id: `${PROVIDER}:${m.slug}`,
    title,
    altTitles,
    description: String(m.description || '').trim(),
    coverImage: m.cover_url || m.banner_url || null,
    author: m.author || null,
    artist: m.artist || null,
    status: mapStatus(m.publication_status),
    year: toNum(m.publication_year),
    tags: [...new Set(parseJsonArray(m.genres).map((g) => String(g).trim()).filter(Boolean))],
    rating: null,
    followedCount: 0,
    demographic: m.demographic || null,
    originalLanguage: m.original_language || null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
  }
}

// Recently-updated feed items carry less metadata but include follower counts
// and an integer genre array.
function mapFeedManga(f) {
  const rating = typeof f.rating === 'number' ? toNum(f.rating) : null
  return {
    id: `${PROVIDER}:${f.slug}`,
    title: String(f.title || '').trim(),
    altTitles: [],
    description: '',
    coverImage: f.poster_url || f.cover_url || null,
    author: null,
    artist: null,
    status: 'unknown',
    year: null,
    tags: [...new Set(parseJsonArray(f.genres).map((g) => String(g).trim()).filter(Boolean))],
    rating,
    followedCount: f.follower_count || 0,
    demographic: null,
    originalLanguage: null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
    chaptersTotal: toNum(f.chapter_count),
  }
}

function mapRecentManga(r) {
  return {
    id: `${PROVIDER}:${r.slug}`,
    title: String(r.title || '').trim(),
    altTitles: [],
    description: '',
    coverImage: r.cover_url || null,
    author: null,
    artist: null,
    status: 'unknown',
    year: null,
    tags: [...new Set(parseJsonArray(r.genres).map((g) => String(g).trim()).filter(Boolean))],
    rating: null,
    followedCount: 0,
    demographic: null,
    originalLanguage: r.original_language || null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
  }
}

// Chapter ids carry the numeric chapter so the manager's pages fallback can
// derive it without another API call.
function chapterKey(ch) {
  const raw = ch.chapter
  if (raw != null && raw !== '') {
    const n = parseFloat(raw)
    return `chapter-${Number.isFinite(n) ? n : raw}`
  }
  if (ch.chapter_number != null) return `chapter-${ch.chapter_number}`
  return `chapter-0`
}

function mapChapter(ref, ch) {
  const num = ch.chapter_number != null ? toNum(ch.chapter_number) : (ch.chapter != null ? parseFloat(ch.chapter) : null)
  return {
    id: `${PROVIDER}:${ref}:${chapterKey(ch)}`,
    chapter: num,
    title: String(ch.chapter_title || `Chapter ${num ?? ''}`).trim(),
    volume: null,
    lang: ch.language || 'en',
    pages: 0,
    publishedAt: ch.uploaded_at || null,
    group: ch.uploader_profile?.username || null,
  }
}

export async function search(query, limit = 20, offset = 0) {
  const per = Math.max(1, Math.min(limit, 50))
  const page = Math.floor(offset / per) + 1
  const j = await api(`/api/manga/search?query=${encodeURIComponent(query)}&page=${page}&limit=${per}`)
  const items = (Array.isArray(j.manga) ? j.manga : []).map(mapManga)
  return { data: items, total: toNum(j.total) || items.length }
}

// detail() resolves metadata through search because the chapter endpoint does
// not carry any manga info. Slugs are slugified titles, so searching the
// slug-derived phrase usually lands on the exact series; slugs with editorial
// suffixes ("-official") fall back to progressively trimmed phrases.
const metaCache = new Map()
const META_CACHE_TTL = 10 * 60 * 1000
const META_CACHE_MAX = 500

function cacheMeta(ref, manga) {
  if (metaCache.size >= META_CACHE_MAX) metaCache.delete(metaCache.keys().next().value)
  metaCache.set(ref, { manga, exp: Date.now() + META_CACHE_TTL })
  return manga
}

function getCachedMeta(ref) {
  const entry = metaCache.get(ref)
  if (!entry || Date.now() > entry.exp) return null
  return entry.manga
}

function altTitles(m) {
  return parseJsonArray(m.alternative_titles).map((t) => String(t).trim()).filter(Boolean)
}

async function resolveMeta(ref) {
  const cached = getCachedMeta(ref)
  if (cached) return cached

  const words = String(ref || '').replace(/-/g, ' ').trim().split(/\s+/).filter(Boolean)
  let best = null
  let bestScore = 0
  // Try the full phrase, then progressively drop trailing words ("...official").
  for (let i = words.length; i > 0 && i >= words.length - 3; i--) {
    const phrase = words.slice(0, i).join(' ')
    let j
    try {
      j = await api(`/api/manga/search?query=${encodeURIComponent(phrase)}&limit=20`)
    } catch {
      continue
    }
    for (const m of Array.isArray(j.manga) ? j.manga : []) {
      if (m.slug === ref) return cacheMeta(ref, mapManga(m))
      const score = Math.max(
        titleScore(phrase, m.title || ''),
        ...(altTitles(m).length ? altTitles(m).map((t) => titleScore(phrase, t)) : [0])
      )
      if (score === 100) return cacheMeta(ref, mapManga(m))
      if (score > bestScore) {
        bestScore = score
        best = m
      }
    }
    if (bestScore >= 100) break
  }
  if (best && bestScore >= 90) return cacheMeta(ref, mapManga(best))
  throw new Error(`LunarX: manga ${ref} not found`)
}

export async function detail(ref) {
  return { data: await resolveMeta(ref) }
}

export async function chapters(ref, _lang = 'en', limit = 100, offset = 0) {
  const j = await api(`/api/manga/${encodeURIComponent(ref)}`)
  const all = (Array.isArray(j.data) ? j.data : []).filter((c) => !c.is_coming_soon)
  const sorted = [...all].sort((a, b) => (toNum(a.chapter_number) || 0) - (toNum(b.chapter_number) || 0))
  const total = toNum(j.count) || all.length
  return { data: sorted.slice(offset, offset + limit).map((c) => mapChapter(ref, c)), total }
}

// Catalog-only: the manager treats this throw as a "no readable pages" signal
// and falls through to a readable provider for the same chapter.
export async function pages() {
  throw new Error('LunarX is catalog-only in this build (no chapter pages)')
}

async function rankedFeed(path, limit, offset) {
  const per = Math.max(1, Math.min(limit, 50))
  const page = Math.floor(offset / per) + 1
  const j = await api(`${path}?limit=${per}&page=${page}`)
  const items = (Array.isArray(j.data) ? j.data : []).map(mapFeedManga)
  return { data: items, total: toNum(j.total) || toNum(j.total_count) || items.length }
}

export async function trending(limit = 20, offset = 0) {
  return rankedFeed('/api/manga/recently-updated', limit, offset)
}

export async function latest(limit = 20, offset = 0) {
  const per = Math.max(1, Math.min(limit, 50))
  const page = Math.floor(offset / per) + 1
  const j = await api(`/api/manga/recent?limit=${per}&page=${page}`)
  const items = (Array.isArray(j.our_mangas) ? j.our_mangas : []).map(mapRecentManga)
  return { data: items, total: toNum(j.total_count) || items.length }
}

export async function random() {
  const pool = await api('/api/manga/recently-updated?limit=50&page=1')
  const total = toNum(pool.total) || 0
  const pages = Math.max(1, Math.min(Math.ceil(total / 50), 100))
  const page = 1 + Math.floor(Math.random() * pages)
  const j = page === 1 ? pool : await api(`/api/manga/recently-updated?limit=50&page=${page}`)
  const list = Array.isArray(j.data) ? j.data : []
  if (!list.length) throw new Error('LunarX: empty random pool')
  return { data: mapFeedManga(list[Math.floor(Math.random() * list.length)]) }
}

export async function lookup(candidates, strict = false) {
  let best = null
  let bestScore = 0
  const seen = new Set()
  for (const query of candidates) {
    const norm = String(query || '').toLowerCase().trim()
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    let j
    try {
      j = await api(`/api/manga/search?query=${encodeURIComponent(query)}&limit=50`)
    } catch {
      continue
    }
    for (const m of Array.isArray(j.manga) ? j.manga : []) {
      const primaryScore = Math.max(0, titleScore(query, m.title || ''))
      const altScore = Math.max(0, ...(altTitles(m).length ? altTitles(m).map((t) => titleScore(query, t)) : [0]))
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

export const provider = normalizeProvider('lunarx', {
  search,
  detail,
  chapters,
  pages,
  trending,
  latest,
  random,
  lookup,
})
