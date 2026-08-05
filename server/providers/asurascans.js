import { titleScore, normalizeTitle, isDoujinshiOrColored } from './util.js'
import { normalizeProvider } from './interface.js'
import { fetchWithTimeout } from '../utils/http.js'

const API = 'https://api.asurascans.com/api'
const PROVIDER = 'asurascans'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function api(path) {
  const res = await fetchWithTimeout(
    API + path,
    { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    { provider: PROVIDER }
  )
  if (!res.ok) throw new Error(`AsuraScans ${res.status}`)
  return res.json()
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function mapManga(s) {
  return {
    id: `${PROVIDER}:${s.slug}`,
    title: s.title,
    description: stripHtml(s.description),
    coverImage: s.cover || null,
    author: s.author || 'Unknown',
    artist: s.artist || null,
    status: s.status || 'unknown',
    year: null,
    tags: (s.genres || []).map((g) => g.name).filter(Boolean),
    rating: s.rating || null,
    followedCount: s.bookmark_count || 0,
    demographic: null,
    originalLanguage: null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
    chaptersTotal: s.chapter_count || 0,
  }
}

export async function search(query, limit = 20, offset = 0) {
  const j = await api(`/search?q=${encodeURIComponent(query)}`)
  const items = (j.data || [])
    .filter((s) => !isDoujinshiOrColored(s.title, s.type))
    .map(mapManga)
  return { data: items.slice(offset, offset + limit), total: items.length }
}

const PER_PAGE = 20

// Fetch enough pages to cover offset+limit (the client asks for up to 30).
async function listSorted(sort, limit, offset) {
  const startPage = Math.floor(offset / PER_PAGE) + 1
  const endPage = Math.ceil((offset + Math.max(limit, 1)) / PER_PAGE)
  const items = []
  let total = 0
  for (let page = startPage; page <= Math.min(endPage, startPage + 5); page++) {
    const j = await api(`/series?sort=${sort}&page=${page}`)
    total = j.meta?.total || total
    items.push(...(j.data || []).map(mapManga))
    if (!j.meta?.has_more) break
  }
  return { data: items.slice(offset % PER_PAGE, offset % PER_PAGE + limit), total }
}

export async function trending(limit = 20, offset = 0) {
  return listSorted('popular', limit, offset)
}

export async function latest(limit = 20, offset = 0) {
  return listSorted('latest', limit, offset)
}

export async function lookup(candidates, strict = false) {
  let best = null
  let bestScore = 0
  const seen = new Set()
  for (const query of candidates) {
    const norm = normalizeTitle(query)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    try {
      const j = await api(`/search?q=${encodeURIComponent(query)}`)
      for (const s of j.data || []) {
        if (isDoujinshiOrColored(s.title, s.type)) continue
        const score = Math.max(0, titleScore(query, s.title))
        if (score === 100) {
          bestScore = 110
          best = s
          break
        }
        if (!strict && score > bestScore) {
          bestScore = score
          best = s
        }
      }
    } catch {
      /* keep searching other candidates */
    }
    if (bestScore >= 110) break
  }
  return bestScore >= (strict ? 110 : 90) ? mapManga(best) : null
}

export async function detail(ref) {
  const j = await api(`/series/${ref}`)
  const s = j.series
  if (!s) throw new Error('AsuraScans: series not found')
  return { data: mapManga(s) }
}

export async function chapters(ref, _lang = 'en', limit = 100, offset = 0) {
  const j = await api(`/series/${ref}/chapters`)
  const all = (j.data || [])
    // Early-access/premium chapters are locked on the site and the API serves
    // them with no page URLs — drop them so the reader never opens a dead page.
    .filter((c) => !c.is_premium)
    .map((c) => ({
      id: `${PROVIDER}:${ref}:${c.slug}`,
      chapter: c.number,
      title: c.title || '',
      volume: null,
      lang: 'en',
      pages: c.page_count || 0,
      publishedAt: c.published_at || null,
      group: null,
    }))
  const end = limit >= 500 ? all.length : Math.min(offset + limit, all.length)
  return { data: all.slice(offset, end), total: all.length }
}

export async function pages(ref) {
  const [slug, chapterSlug] = String(ref || '').split(':')
  if (!slug || !chapterSlug) throw new Error('AsuraScans: malformed chapter id')
  const j = await api(`/series/${slug}/chapters/${chapterSlug}`)
  const urls = (j.data?.chapter?.pages || []).map((p) => p.url).filter(Boolean)
  return { pages: urls, pagesSd: urls, hash: null, baseUrl: null }
}

export async function random() {
  const page = Math.floor(Math.random() * 20) + 1
  const j = await api(`/series?sort=popular&page=${page}`)
  const items = (j.data || []).map(mapManga)
  const item = items[Math.floor(Math.random() * items.length)] || null
  return { data: item }
}

export const provider = normalizeProvider('asurascans', { search, detail, chapters, pages, trending, latest, random, lookup })
