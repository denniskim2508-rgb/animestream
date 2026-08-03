// Provider-agnostic manga client. The server-side Provider Manager handles
// all provider routing/fallback and returns normalized shapes, so this module
// (and the rest of React) never knows which provider served the data.
const BASE = '/api/manga'

export async function searchManga(query, limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Search failed')
  const json = await res.json()
  return { data: json.data || [], total: json.total || 0 }
}

export async function lookupManga(titles, { strict = false } = {}) {
  const list = (Array.isArray(titles) ? titles : [titles])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
  if (!list.length) return null
  const res = await fetch(
    `${BASE}/lookup?${list.map((t) => `titles=${encodeURIComponent(t)}`).join('&')}${strict ? '&strict=1' : ''}`
  )
  if (!res.ok) return null
  const json = await res.json()
  return json.data || null
}

export async function getTrendingManga(limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/trending?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch trending')
  const json = await res.json()
  return { data: json.data || [], total: json.total || 0 }
}

export async function getLatestManga(limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/latest?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch latest')
  const json = await res.json()
  return { data: json.data || [], total: json.total || 0 }
}

export async function getRandomManga() {
  const res = await fetch(`${BASE}/random`)
  if (!res.ok) throw new Error('Failed to fetch random manga')
  const json = await res.json()
  return json.data
}

export async function getMangaDetails(id) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('Failed to fetch manga details')
  const json = await res.json()
  return json.data
}

export async function getMangaChapters(id, lang = 'en', limit = 100, offset = 0) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/chapters?lang=${lang}&limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch chapters')
  const json = await res.json()
  return { data: json.data || [], total: json.total || 0 }
}

export async function getChapterPages(chapterId, mangaId) {
  const qs = mangaId ? `?manga=${encodeURIComponent(mangaId)}` : ''
  const res = await fetch(`${BASE}/chapter/${encodeURIComponent(chapterId)}${qs}`)
  if (!res.ok) throw new Error('Failed to fetch chapter pages')
  return res.json()
}
