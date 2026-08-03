import { titleScore, normalizeTitle } from './util.js'
import { normalizeProvider } from './interface.js'

const BASE = 'https://atsu.moe'
const PROVIDER = 'atsu'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// Atsumaru is a SvelteKit app backed by Appwrite collections (search) and a
// Hono `/api` (detail/chapters/reader). No Cloudflare challenge and image
// hosts allow direct hotlinking, so everything is plain fetch.
async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) },
  })
  if (!res.ok) throw new Error(`Atsu ${res.status}`)
  return res.json()
}

// Image paths arrive as `/static/...` (search/doc + reader) or bare
// `posters/...` (home lists); both live under the same base.
function absolute(url) {
  const s = String(url || '')
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  return BASE + (s.startsWith('/static/') ? s : `/static/${s}`)
}

function mapManga(d) {
  return {
    id: `${PROVIDER}:${d.id}`,
    title: d.title,
    description: d.synopsis || '',
    coverImage: absolute(d.poster || d.image || null),
    author: (Array.isArray(d.authors) && d.authors.join(', ')) || 'Unknown',
    artist: null,
    status: d.status ? String(d.status).toLowerCase() : 'unknown',
    year: d.releaseYear || d.year || null,
    tags: Array.isArray(d.tags) ? d.tags : [],
    rating: d.mbRating || null,
    followedCount: null,
    demographic: null,
    originalLanguage: null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
    chaptersTotal: d.chapterCount || 0,
    altTitles: Array.isArray(d.otherNames) ? d.otherNames : [],
  }
}

function sliceResult(all, limit, offset) {
  const end = limit >= 500 ? all.length : Math.min(offset + limit, all.length)
  return { data: all.slice(offset, end), total: all.length }
}

export async function search(query, limit = 20, offset = 0) {
  const q = String(query || '').trim()
  const params = new URLSearchParams({
    q: q || '*',
    query_by: 'title,otherNames',
    query_by_weights: '2,1',
    per_page: String(Math.max(limit, 1)),
    filter_by: 'hidden:!=true',
  })
  if (offset > 0) params.set('page', String(Math.floor(offset / Math.max(limit, 1)) + 1))
  const j = await api(`/collections/manga/documents/search?${params}`)
  const data = (j.hits || []).map((h) => mapManga(h.document))
  return { data, total: j.found || data.length }
}

export async function detail(ref) {
  const j = await api(`/collections/manga/documents/${encodeURIComponent(ref)}`)
  if (!j || !j.id) throw new Error('Atsu: manga not found')
  return { data: mapManga(j) }
}

export async function chapters(ref, _lang = 'en', limit = 100, offset = 0) {
  const j = await api(`/api/manga/info?mangaId=${encodeURIComponent(ref)}`)
  const all = (j.chapters || []).map((c) => ({
    id: `${PROVIDER}:${ref}:${c.id}`,
    chapter: c.number,
    title: c.title || '',
    volume: null,
    lang: 'en',
    pages: c.pageCount || 0,
    publishedAt: null,
    group: null,
  }))
  return sliceResult(all, limit, offset)
}

export async function pages(ref) {
  const [mangaId, chapterId] = String(ref || '').split(':')
  if (!mangaId || !chapterId) throw new Error('Atsu: malformed chapter id')
  const j = await api(
    `/api/read/chapter?mangaId=${encodeURIComponent(mangaId)}&chapterId=${encodeURIComponent(chapterId)}`
  )
  const urls = (j.readChapter?.pages || []).map((p) => absolute(p.image)).filter(Boolean)
  return { pages: urls, pagesSd: urls, hash: null, baseUrl: null }
}

async function homeList(endpoint, limit, offset) {
  const j = await api(`/api/home2/${endpoint}?limit=${Math.max(limit, 1)}&offset=${offset || 0}`)
  const data = (j.items || []).map(mapManga)
  return { data, total: data.length }
}

export async function trending(limit = 20, offset = 0) {
  return homeList('popular', limit, offset)
}

export async function latest(limit = 20, offset = 0) {
  return homeList('recentlyAdded', limit, offset)
}

export async function random() {
  const j = await api('/api/home2/popular?limit=40&offset=0')
  const items = (j.items || []).map(mapManga)
  return { data: items[Math.floor(Math.random() * items.length)] || null }
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
      const res = await search(query, 20, 0)
      for (const item of res.data) {
        const score = Math.max(0, titleScore(query, item.title))
        if (score === 100) {
          bestScore = 110
          best = item
          break
        }
        if (!strict && score > bestScore) {
          bestScore = score
          best = item
        }
      }
    } catch {
      /* keep searching other candidates */
    }
    if (bestScore >= 110) break
  }
  return bestScore >= (strict ? 110 : 90) ? best : null
}

export const provider = normalizeProvider('atsu', { search, detail, chapters, pages, trending, latest, random, lookup })
