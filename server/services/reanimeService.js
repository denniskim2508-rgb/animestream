// Re:ANIME provider (reanime.to). Used as a supplementary metadata/episode-list
// source alongside AniDap: it returns FULL episode lists (One Piece EP 1..1176,
// sub & dub) that anidap often lacks for long-running titles. Stream *sources*
// on reanime require an account (401), so we only consume its public metadata +
// episodes endpoints and keep anidap for actual HLS playback.
//
// Public (no auth) endpoints used:
//   GET /api/v1/search?q={title}&type=anime        -> results[].anime_id + anilist_id
//   GET /api/v1/anime/{anime_id}                    -> details (anilist_id, last_episode, subbed, dubbed)
//   GET /api/v1/anime/{anime_id}/episodes?limit=2000-> full episode list
//
// All lookups are cached (15 min) and single-flighted so the detail page never
// re-hammers reanime.

import { fetchWithTimeout } from '../utils/http.js'
import { cache } from '../cache/memoryCache.js'

const REANIME = 'https://reanime.to'
const REANIME_HEADERS = {
  'Accept': 'application/json',
  'Referer': REANIME,
  'User-Agent': 'Mozilla/5.0 (KaisenAnimeTV; +local-app)',
}
const REANIME_TIMEOUT_MS = 8000
const EPISODES_LIMIT = 2000

const REANIME_CACHE = cache('reanime', { ttlMs: 15 * 60 * 1000, maxEntries: 300 })

async function reanimeFetch(url) {
  const res = await fetchWithTimeout(url, { headers: REANIME_HEADERS }, {
    provider: 'reanime',
    timeoutMs: REANIME_TIMEOUT_MS,
  })
  return res.json()
}

// Resolve the reanime `anime_id` (slug) for an AniList id by searching on the
// title and matching anilist_id. Returns the matching anime_id or null.
async function resolveAnimeId(anilistId, title) {
  if (!anilistId || !title) return null
  return REANIME_CACHE.cached(`slug:${anilistId}`, async () => {
    const data = await reanimeFetch(`${REANIME}/api/v1/search?q=${encodeURIComponent(title)}&type=anime`)
    const hit = (data?.results || []).find((r) => Number(r.anilist_id) === Number(anilistId))
    return hit?.anime_id || null
  })
}

/**
 * Fetch reanime metadata + the full episode list for an AniList id.
 * Returns `{ available:false }` when reanime has no match/list so callers can
 * fall back to anidap instead of treating it as a fatal error.
 */
export async function getReanimeEpisodes(anilistId, title) {
  try {
    const animeId = await resolveAnimeId(anilistId, title)
    if (!animeId) return { available: false }

    const [detail, epData] = await Promise.all([
      REANIME_CACHE.cached(`detail:${animeId}`, () => reanimeFetch(`${REANIME}/api/v1/anime/${animeId}`)),
      REANIME_CACHE.cached(`episodes:${animeId}`, () =>
        reanimeFetch(`${REANIME}/api/v1/anime/${animeId}/episodes?limit=${EPISODES_LIMIT}`)),
    ])

    const eps = Array.isArray(epData?.data) ? epData.data : []
    const episodeNumbers = eps
      .map((e) => Number(e.episode_number))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)

    return {
      available: episodeNumbers.length > 0,
      animeId,
      totalEpisodes: episodeNumbers.length,
      episodeList: episodeNumbers,
      subbed: eps.some((e) => e.subbed !== false),
      dubbed: eps.some((e) => e.dubbed === true),
      lastEpisode: detail?.last_episode,
    }
  } catch (err) {
    console.error(`[reanime] error for ${anilistId}: ${err.message}`)
    return { available: false }
  }
}
