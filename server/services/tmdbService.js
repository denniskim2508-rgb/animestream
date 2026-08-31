// TMDB integration for the TV detail page (episode stills + season/episode
// metadata). The Bearer access token is read ONLY here, server-side — it must
// never be shipped to the client bundle (use TMDB_ACCESS_TOKEN, not VITE_*).
//
// Matching strategy (validated against One Piece / Demon Slayer / Attack on
// Titan / Jujutsu Kaisen): the client already has the authoritative AniList id,
// title and release year, so we never fuzzy-search the title mid-request. We
// search TMDB by the AniList title and rank candidates by title similarity and
// first-air-year proximity. A candidate is accepted only when the title words
// overlap enough AND the year is within a small window — this cleanly separates
// e.g. the 1999 One Piece anime (TMDB id 37854) from the 2023 live-action
// series (id 111110). When nothing confident matches we report `matched:false`
// so the page keeps its existing numeric episode layout (no random artwork).
//
// Results are cached because TMDB metadata is stable and the same detail page
// is revisited often.

import { fetchWithTimeout } from '../utils/http.js'
import { cache } from '../cache/memoryCache.js'

const TMDB_API = 'https://api.themoviedb.org/3'
const TMDB_CACHE = cache('tmdb', { ttlMs: 24 * 60 * 60 * 1000, maxEntries: 200 })

function token() {
  return process.env.TMDB_ACCESS_TOKEN || ''
}

function tmdbFetch(path, label) {
  const tok = token()
  if (!tok) {
    const err = new Error('TMDB_ACCESS_TOKEN not configured')
    err.code = 'NO_TMDB_TOKEN'
    throw err
  }
  return fetchWithTimeout(
    `${TMDB_API}${path}`,
    { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } },
    { provider: 'tmdb', label, timeoutMs: 8000 }
  )
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}
function words(s) {
  return new Set(norm(s).split(' ').filter(Boolean))
}
function titleSimilarity(a, b) {
  const A = words(a)
  const B = words(b)
  const inter = new Set([...A].filter((t) => B.has(t)))
  return inter.size / Math.max(1, Math.max(A.size, B.size))
}

// Score a TMDB search result against the AniList title + release year.
// Title similarity is primary; year proximity breaks near-ties and rejects
// unrelated same-name shows (live-action remakes, spin-offs).
function scoreCandidate(result, title, year) {
  const airYear = result.first_air_date ? parseInt(result.first_air_date.slice(0, 4), 10) : 0
  const ts = titleSimilarity(result.name, title)
  const yearProx = year && airYear ? Math.max(0, 1 - Math.abs(airYear - year) / 10) : 0.4
  return { id: result.id, airYear, ts, composite: ts * 0.7 + yearProx * 0.3 }
}

async function searchTV(title) {
  const res = await tmdbFetch(`/search/tv?query=${encodeURIComponent(title)}&language=en-US&page=1&include_adult=false`, 'tmdb search')
  const json = await res.json()
  return json.results || []
}

async function getShow(tmdbId) {
  const res = await tmdbFetch(`/tv/${tmdbId}?language=en-US`, 'tmdb tv')
  return res.json()
}

async function getSeason(tmdbId, seasonNumber) {
  const res = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}?language=en-US`, 'tmdb season')
  return res.json()
}

// Resolve the TMDB show id for an AniList anime, or null when no confident
// match exists. Cached per anilistId.
async function resolveTMDBId(anilistId, { title, year } = {}) {
  const key = `resolve:${anilistId}`
  const cached = TMDB_CACHE.get(key)
  if (cached !== undefined) return cached

  if (!title) return null
  const results = await searchTV(title)
  if (!results.length) {
    TMDB_CACHE.set(key, null)
    return null
  }
  const scored = results.map((r) => scoreCandidate(r, title, year)).sort((a, b) => b.composite - a.composite)
  const top = scored[0]
  if (!top || top.ts < 0.6 || !top.airYear || (year && Math.abs(top.airYear - year) > 5)) {
    TMDB_CACHE.set(key, null)
    return null
  }
  TMDB_CACHE.set(key, top.id)
  return top.id
}

// Full episode metadata for an AniList anime. Returns null when no confident
// TMDB match exists (caller falls back to its existing numeric layout).
export async function getTMDBEpisodes(anilistId, { title, year } = {}) {
  const key = `episodes:${anilistId}`
  const cached = TMDB_CACHE.get(key)
  if (cached !== undefined) return cached

  const tmdbId = await resolveTMDBId(anilistId, { title, year })
  if (!tmdbId) return null

  const show = await getShow(tmdbId)
  const seasonsMeta = (show.seasons || [])
    .filter((s) => s.season_number >= 1)
    .map((s) => ({ number: s.season_number, name: s.name, episodeCount: s.episode_count || 0 }))

  // Bound how many season detail calls we make; enough for the common
  // first-cour/single-season cases without hammering the API for giant
  // franchises. Season *counts* still come from the cheap show call.
  const MAX_SEASONS = 8
  const episodes = []
  for (const s of seasonsMeta.slice(0, MAX_SEASONS)) {
    if (!s.episodeCount) continue
    let season
    try {
      season = await getSeason(tmdbId, s.number)
    } catch {
      continue
    }
    for (const ep of season.episodes || []) {
      episodes.push({
        season: ep.season_number,
        episode: ep.episode_number,
        name: ep.name || '',
        overview: (ep.overview || '').replace(/\s+/g, ' ').trim(),
        stillPath: ep.still_path || null,
      })
    }
  }

  const payload = { tmdbId, showName: show.name, seasons: seasonsMeta, episodes }
  TMDB_CACHE.set(key, payload)
  return payload
}
