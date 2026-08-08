// Service layer for anime: AniDap proxying, the AniList homepage queries, and
// stream resolution. Every outbound call goes through fetchWithTimeout (5s cap,
// retry on 429/5xx, per-provider stats). Homepage data is cached for 5 minutes
// and single-flighted so the hero/trending rows never re-hammer upstreams.

import { fetchWithTimeout } from '../utils/http.js'
import { cache } from '../cache/memoryCache.js'

const ANIDAP_MAIN = 'https://anidap.lol'
const ANIDAP_CHAD = 'https://chad.anidap.lol'

const ANIDAP_HEADERS = {
  'Origin': 'https://anidap.lol',
  'Referer': 'https://anidap.lol/',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
}

// AniDap responses may legitimately be large (full episode lists, source lists),
// so give the proxy a slightly longer cap than the 5s default.
const ANIDAP_TIMEOUT_MS = 8000

async function anidapFetch(url) {
  const res = await fetchWithTimeout(url, { headers: ANIDAP_HEADERS }, { provider: 'anidap', timeoutMs: ANIDAP_TIMEOUT_MS })
  return res.json()
}

// ── AniDap lookups ────────────────────────────────────────────
// Details/search/episodes/recents are stable, so they are cached (5 min) and
// single-flighted. Servers/sources are short-lived (signed URLs, episode state),
// so they only get single-flight dedup, never a long-lived cache entry.

const ANIDAP_CACHE = cache('anidap', { ttlMs: 5 * 60 * 1000, maxEntries: 300 })

export async function getAnimeDetails(anilistId) {
  return ANIDAP_CACHE.cached(`anime:${anilistId}`, () => anidapFetch(`${ANIDAP_MAIN}/api/anime/${anilistId}`))
}

export async function searchAnidap(q) {
  return ANIDAP_CACHE.cached(`search:${q}`, () => anidapFetch(`${ANIDAP_MAIN}/api/anime/search?q=${encodeURIComponent(q)}`))
}

export async function getEpisodes(slug) {
  return ANIDAP_CACHE.cached(`episodes:${slug}`, () => anidapFetch(`${ANIDAP_CHAD}/rest/api/episodes?id=${slug}`))
}

export async function getServers(slug, epNum) {
  return ANIDAP_CACHE.singleFlight(`servers:${slug}:${epNum}`, () => anidapFetch(`${ANIDAP_CHAD}/rest/api/servers?id=${slug}&epNum=${epNum}`))
}

export async function getSources(slug, epNum, type, providerId) {
  return ANIDAP_CACHE.singleFlight(`sources:${slug}:${epNum}:${type}:${providerId}`, () =>
    anidapFetch(`${ANIDAP_CHAD}/rest/api/sources?id=${slug}&epNum=${epNum}&type=${type}&providerId=${providerId}`)
  )
}

export async function getRecents() {
  const data = await ANIDAP_CACHE.cached('recents', () => anidapFetch(`${ANIDAP_MAIN}/api/anime/recents?limit=20`))
  return data?.data?.data || data?.data || []
}

export async function checkAvailability(anilistId, episode) {
  try {
    const details = await getAnimeDetails(anilistId)
    const slug = details?.data?.id
    if (!slug) return { hasSub: false, hasDub: false }
    const servers = await getServers(slug, Number(episode))
    return {
      hasSub: !!(servers.subProviders?.length),
      hasDub: !!(servers.dubProviders?.length),
    }
  } catch (err) {
    console.error(`[availability] Error: ${err.message}`)
    return { hasSub: false, hasDub: false }
  }
}

const STREAM_BLACKLIST = ['beep', 'sora']

// Resolve errors get a stable `code` so the client can show a tailored message
// (e.g. "English Dub is not available") instead of a generic failure.
function errCode(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

// Providers that mirror their sub stream for "dub" requests (kiwi, uwu return
// the exact same m3u8 for sub and dub) would play Japanese audio under a DUB
// label. We detect that by comparing the source URLs anidap hands back for the
// two audio types: identical URL => not a real dub => skip that provider.
const AUDIO_VERDICT_TTL = 5 * 60 * 1000

// Cached per (slug, ep, provider): 'real' (distinct dub stream), 'mirror' (same
// URL as sub, so not actually dubbed), or 'nosrc' (no dub source). Anidap
// rate-limits hard (429, up to ~43s), so the verdict is cached to avoid
// re-comparing sub/dub on every request.
async function dubVerdict(slug, ep, providerId) {
  return ANIDAP_CACHE.cached(`dubVerdict:${slug}:${ep}:${providerId}`, async () => {
    const [sub, dub] = await Promise.all([
      getSources(slug, ep, 'sub', providerId).catch(() => null),
      getSources(slug, ep, 'dub', providerId).catch(() => null),
    ])
    const dubUrl = dub?.sources?.[0]?.url
    if (!dubUrl) return 'nosrc'
    const subUrl = sub?.sources?.[0]?.url
    if (subUrl && subUrl === dubUrl) return 'mirror'
    return 'real'
  }, AUDIO_VERDICT_TTL)
}

// Priority order: kiwi first, then a provider flagged default, then the rest.
// Stable (no mutation of the source arrays).
function providerPriority(providers) {
  const rank = (p) => (p.id === 'kiwi' ? 0 : p.default ? 1 : 2)
  return [...providers].sort((a, b) => rank(a) - rank(b))
}

// Resolve the full streaming response for the player: find the anime slug,
// pick a non-blacklisted provider whose source actually matches the requested
// audio (falling back across providers before playback), and bundle everything
// the client needs (url, headers, tracks, metadata) in one call. For DUB the
// selected provider's stream is verified against its own SUB source so a DUB
// label can never silently wrap a Japanese stream. Pass `provider` to pin the
// resolution to one provider (used by the player's manual provider switch).
export async function resolveStream({ anilistId, episode, audio = 'sub', provider }) {
  const ep = Number(episode)
  const type = audio === 'dub' ? 'dub' : 'sub'

  const details = await getAnimeDetails(anilistId)
  const slug = details?.data?.id
  if (!slug) throw new Error('Could not find anime slug')

  const servers = await getServers(slug, ep)
  const allProviders = type === 'dub' ? servers.dubProviders : servers.subProviders
  if (!allProviders?.length) throw errCode(`${type.toUpperCase()}_NOT_AVAILABLE`, type === 'dub'
    ? 'English Dub is not available for this episode'
    : 'Subtitled stream is not available for this episode')

  const usable = allProviders.filter((p) => !STREAM_BLACKLIST.includes(p.id))
  if (!usable.length) throw errCode(`${type.toUpperCase()}_NOT_AVAILABLE`, type === 'dub'
    ? 'English Dub is not available for this episode'
    : 'Subtitled stream is not available for this episode')

  // Explicit provider pin: verify it too, but don't silently fall back to a
  // different provider (the user asked for this one).
  const candidates = provider
    ? usable.filter((p) => p.id === provider)
    : providerPriority(usable)
  if (!candidates.length) throw errCode('PROVIDER_NOT_FOUND', `Provider ${provider} is not available for ${type}`)

  let resolved = null
  for (const p of candidates) {
    if (type === 'dub') {
      const verdict = await dubVerdict(slug, ep, p.id)
      if (verdict !== 'real') {
        console.log(`[stream] ${slug} ep ${ep} dub: skip ${p.id} (${verdict})`)
        continue
      }
    }
    const sources = await getSources(slug, ep, type, p.id).catch(() => null)
    if (!sources?.sources?.length) {
      console.log(`[stream] ${slug} ep ${ep} ${type}: skip ${p.id} (no sources)`)
      continue
    }
    resolved = { provider: p.id, sources }
    break
  }

  if (!resolved) {
    throw errCode(`${type.toUpperCase()}_NOT_AVAILABLE`, type === 'dub'
      ? 'English Dub is not available for this episode'
      : 'Subtitled stream is not available for this episode')
  }

  const sourceUrl = resolved.sources.sources[0].url
  const cdnHeaders = resolved.sources.headers || {}

  const episodeTitle = details?.data?.title?.english
    || details?.data?.title?.romaji
    || `Episode ${ep}`

  const totalEpisodes = details?.data?.episodeCount || details?.data?.episodes || 0

  console.log(`[stream] ${slug} ep ${ep} ${type} via ${resolved.provider}: ${sourceUrl.substring(0, 80)}...`)

  return {
    url: sourceUrl,
    cdnHeaders,
    provider: resolved.provider,
    providers: usable.map((p) => ({ id: p.id, tip: p.tip, default: p.default })),
    tracks: resolved.sources.tracks || [],
    chapters: resolved.sources.chapters || [],
    episodeTitle,
    totalEpisodes,
    slug,
    hasSub: !!(servers.subProviders?.length),
    hasDub: type === 'dub' ? true : !!(servers.dubProviders?.length),
    audioVerified: true,
  }
}

// ── AniList homepage (hero / trending rows) ────────────────────
// Run the six homepage queries in parallel and cache the merged raw result for
// 5 minutes. Individual query failures return null (never the whole page); the
// client normalizes the raw media nodes exactly as it did when it fetched
// AniList directly.

const ANILIST_API = 'https://graphql.anilist.co'
const HOME_CACHE = cache('anime:home', { ttlMs: 5 * 60 * 1000, maxEntries: 20 })

// AniList GraphQL is heavier than the 5s default; still hard-capped so a hung
// AniList can never stall the backend.
const ANILIST_TIMEOUT_MS = 8000

async function anilistFetch(query, variables, label) {
  const res = await fetchWithTimeout(
    ANILIST_API,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
    { provider: 'anilist', label, timeoutMs: ANILIST_TIMEOUT_MS }
  )
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const MEDIA_FRAGMENT = `
  id
  title { romaji english native }
  coverImage { large medium color }
  bannerImage
  description(asHtml: false)
  genres
  averageScore
  meanScore
  episodes
  duration
  status
  format
  season
  seasonYear
  trending
  popularity
  favourites
  nextAiringEpisode { episode timeUntilAiring }
  streamingEpisodes { title thumbnail url site }
  trailer { id site thumbnail }
  studios(isMain: true) { nodes { name } }
`

function homeQuery(sort, extra = '') {
  return `query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: ${sort}, isAdult: false${extra}) {
        ${MEDIA_FRAGMENT}
      }
    }
  }`
}

function homeSections(perPage) {
  return [
    ['trending', homeQuery('TRENDING_DESC')],
    ['topRated', homeQuery('SCORE_DESC')],
    ['popular', homeQuery('POPULARITY_DESC')],
    ['recentlyUpdated', homeQuery('UPDATED_AT_DESC', ', status: RELEASING')],
    ['newReleases', homeQuery('START_DATE_DESC')],
    ['upcoming', homeQuery('POPULARITY_DESC', ', status: NOT_YET_RELEASED')],
  ].map(([name, query]) => [
    name,
    anilistFetch(query, { page: 1, perPage }, `home:${name}`)
      .then((d) => d?.Page?.media || null)
      .catch((err) => {
        console.error(`[anilist] home:${name} failed: ${err.message}`)
        return null
      }),
  ])
}

export function fetchHome(perPage = 10) {
  const p = Math.max(1, Math.min(Number(perPage) || 10, 50))
  return HOME_CACHE.cached(`home:${p}`, async () => {
    const sections = homeSections(p)
    const settled = await Promise.allSettled(sections.map(([, p]) => p))
    return Object.fromEntries(sections.map(([name], i) => [
      name,
      settled[i].status === 'fulfilled' ? settled[i].value : null,
    ]))
  })
}
