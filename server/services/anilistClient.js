// Shared AniList GraphQL client used by every AniList consumer in the backend
// (homepage feeds, the adaptation resolver, and the health probe). Public
// queries need no authentication, so none is added — but AniList's edge behaves
// more predictably with an explicit application User-Agent, which carries no
// secrets. Outage/rate-limit responses are recorded through the shared http
// wrapper (provider stats + circuit breaker + timeout).

import { fetchWithTimeout } from '../utils/http.js'

export const ANILIST_API = 'https://graphql.anilist.co'
export const ANILIST_TIMEOUT_MS = 8000

// AniList's documented behavior: when the API is disabled it returns HTTP 403
// with a GraphQL error body. The http wrapper captures that body, so a 403 is
// distinguishable from a generic outage (classified as `forbidden`).
export const ANILIST_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Animestream/1.0 (provider health monitor; contact: project maintainer)',
}

// Minimal, stable query used by the health probe (tiny, anonymous).
export const HEALTH_QUERY = `query { Page(page: 1, perPage: 1) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { id } } }`

// Run a GraphQL query against AniList. Throws on HTTP failures (via
// fetchWithTimeout) or GraphQL-level errors.
export async function anilistGraphQL(query, variables = {}, label) {
  const res = await fetchWithTimeout(
    ANILIST_API,
    { method: 'POST', headers: ANILIST_HEADERS, body: JSON.stringify({ query, variables }) },
    { provider: 'anilist', label, timeoutMs: ANILIST_TIMEOUT_MS }
  )
  const json = await res.json()
  if (json.errors) {
    const err = new Error(json.errors[0].message)
    err.code = 'ANILIST_GRAPHQL'
    throw err
  }
  return json.data
}
