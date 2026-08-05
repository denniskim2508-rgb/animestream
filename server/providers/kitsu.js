import { titleScore, normalizeTitle, isDoujinshiOrColored } from './util.js'
import { normalizeProvider } from './interface.js'
import { fetchWithTimeout } from '../utils/http.js'

const API = 'https://kitsu.io/api/edge'
const PROVIDER = 'kitsu'

async function api(path) {
  const res = await fetchWithTimeout(
    API + path,
    { headers: { Accept: 'application/vnd.api+json' } },
    { provider: PROVIDER }
  )
  if (!res.ok) throw new Error(`Kitsu ${res.status}`)
  return res.json()
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const STATUS_MAP = {
  current: 'ongoing',
  finished: 'completed',
  upcoming: 'upcoming',
  unreleased: 'upcoming',
}

function mapManga(m) {
  const a = m.attributes || {}
  return {
    id: `${PROVIDER}:${m.id}`,
    title: a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Unknown',
    description: stripHtml(a.synopsis || a.description || ''),
    coverImage: a.posterImage?.original || a.posterImage?.large || a.posterImage?.medium || null,
    author: 'Unknown',
    artist: null,
    status: STATUS_MAP[a.status] || a.status || 'unknown',
    year: a.startDate ? Number(String(a.startDate).slice(0, 4)) || null : null,
    tags: (a.genres || []).map((g) => g.name),
    rating: a.averageRating != null ? a.averageRating / 10 : null,
    followedCount: a.userCount || 0,
    demographic: null,
    originalLanguage: a.originalLanguage || null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
  }
}

function isUsable(m) {
  const a = m.attributes || {}
  const t = a.canonicalTitle || ''
  if (isDoujinshiOrColored(t, a.subtype)) return false
  if (a.subtype === 'novel') return false
  return !!t
}

// Kitsu is a metadata database — it has no scanlation reader, so it powers
// title lookup/cross-linking only. It is not registered for browse lists.
export async function lookup(candidates, strict = false) {
  let best = null
  let bestScore = 0
  const seen = new Set()
  for (const query of candidates) {
    const norm = normalizeTitle(query)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    try {
      const j = await api(`/manga?filter[text]=${encodeURIComponent(query)}`)
      for (const m of j.data || []) {
        if (!isUsable(m)) continue
        const t = m.attributes.canonicalTitle || ''
        const score = Math.max(0, titleScore(query, t))
        if (score === 100) {
          bestScore = 110
          best = m
          break
        }
        if (!strict && score > bestScore) {
          bestScore = score
          best = m
        }
      }
    } catch {
      /* keep searching other candidates */
    }
    if (bestScore >= 110) break
  }
  return bestScore >= (strict ? 110 : 90) ? mapManga(best) : null
}

export async function search(query, limit = 20, offset = 0) {
  const j = await api(`/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=${Math.min(limit, 20)}&page[offset]=${offset}`)
  const items = (j.data || []).filter(isUsable).map(mapManga)
  return { data: items, total: j.meta?.count || items.length }
}

export async function trending(limit = 20, offset = 0) {
  const j = await api(`/manga?sort=-userCount&page[limit]=${Math.min(limit, 20)}&page[offset]=${offset}`)
  return { data: (j.data || []).filter(isUsable).map(mapManga), total: j.meta?.count || 0 }
}

export async function latest(limit = 20, offset = 0) {
  const j = await api(`/manga?sort=-updatedAt&page[limit]=${Math.min(limit, 20)}&page[offset]=${offset}`)
  return { data: (j.data || []).filter(isUsable).map(mapManga), total: j.meta?.count || 0 }
}

export async function detail(ref) {
  const j = await api(`/manga/${ref}?include=genres`)
  const m = j.data
  if (!m) throw new Error('Kitsu: manga not found')
  const genres = (j.included || [])
    .filter((x) => x.type === 'genres' && x.attributes?.name)
    .map((x) => x.attributes.name)
  return { data: mapManga({ ...m, attributes: { ...m.attributes, genres } }) }
}

export async function chapters(ref, _lang = 'en', limit = 100, offset = 0) {
  const j = await api(`/manga/${ref}/chapters?page[limit]=${Math.min(limit, 500)}&page[offset]=${offset}`)
  const all = (j.data || []).map((c) => {
    const a = c.attributes || {}
    return {
      id: `${PROVIDER}:${ref}:${c.id}`,
      chapter: a.number != null ? Number(a.number) : null,
      title: a.canonicalTitle || `Chapter ${a.number || ''}`.trim(),
      volume: a.volumeNumber != null ? Number(a.volumeNumber) : null,
      lang: 'en',
      pages: 0,
      publishedAt: a.published || null,
      group: null,
    }
  })
  return { data: all, total: j.meta?.count || all.length }
}

export async function pages() {
  throw new Error('Kitsu does not host scanlation pages')
}

export async function random() {
  return { data: null }
}

export const provider = normalizeProvider('kitsu', { search, detail, chapters, pages, trending, latest, random, lookup })
