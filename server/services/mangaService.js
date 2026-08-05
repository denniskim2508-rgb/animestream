// Service layer for manga endpoints: wraps the Provider Manager with a 5-minute
// in-memory cache and single-flight dedup so concurrent homepage/list requests
// share one upstream fetch instead of hammering every provider. Single-item
// lookups (detail/chapters/pages) stay cached/checked inside the manager.

import * as manager from '../providers/manga.js'
import { cache } from '../cache/memoryCache.js'

const LIST_CACHE = cache('manga:lists', { ttlMs: 5 * 60 * 1000, maxEntries: 200 })
const DETAIL_CACHE = cache('manga:detail', { ttlMs: 5 * 60 * 1000, maxEntries: 400 })

export function search(query, limit = 20, offset = 0) {
  return LIST_CACHE.cached(`search:${query}:${limit}:${offset}`, () => manager.search(query, limit, offset))
}

export function trending(limit = 20, offset = 0) {
  return LIST_CACHE.cached(`trending:${limit}:${offset}`, () => manager.trending(limit, offset))
}

export function latest(limit = 20, offset = 0) {
  return LIST_CACHE.cached(`latest:${limit}:${offset}`, () => manager.latest(limit, offset))
}

// Random is intentionally NOT stored (it should feel random), but concurrent
// hits are still deduped into a single provider request.
export function random() {
  return LIST_CACHE.singleFlight('random', () => manager.random())
}

export function lookup(titles, strict = false) {
  const key = `lookup:${strict ? 1 : 0}:${titles.join('|')}`
  return LIST_CACHE.cached(key, () => manager.lookup(titles, strict))
}

export function detail(id) {
  return DETAIL_CACHE.cached(`detail:${id}`, () => manager.detail(id))
}

export const chapters = manager.chapters
export const pages = manager.pages
export const splitId = manager.splitId

export function cacheInfo() {
  return {
    lists: { size: LIST_CACHE.size(), keys: LIST_CACHE.keys() },
    detail: { size: DETAIL_CACHE.size(), keys: DETAIL_CACHE.keys() },
  }
}
