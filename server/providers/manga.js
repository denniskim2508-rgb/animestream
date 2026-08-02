// Provider Manager: the single server-side gateway for manga content.
// React never talks to a provider directly — it consumes normalized shapes
// through the /api/manga/* endpoints, and opaque ids like "allmanga:<ref>".
//
// List endpoints (search/trending/latest) query EVERY provider in parallel and
// merge the results, so a title that only exists on one provider still shows up.
// Single-item operations (detail/chapters/pages/lookup) route by opaque id or
// fall back through the readable providers (Kitsu adds lookup coverage only,
// since it has no reader). More adapters can be added to the registry without
// touching the API layer.

import * as mangadex from './mangadex.js'
import * as allmanga from './allmanga.js'
import * as asurascans from './asurascans.js'
import * as mangapill from './mangapill.js'
import * as kitsu from './kitsu.js'
import { normalizeTitle, titleScore } from './util.js'

const PROVIDERS = { mangadex, allmanga, asurascans, mangapill, kitsu }
const FALLBACK_ORDER = ['mangadex', 'asurascans', 'mangapill', 'allmanga']
const MERGE_ORDER = ['mangadex', 'asurascans', 'mangapill', 'allmanga']

// Cross-link lookups additionally fall back to Kitsu (metadata only, no reader)
// as a last resort so obscure titles still surface as manga info.
const LOOKUP_ORDER = [...FALLBACK_ORDER, 'kitsu']

// `mangadex:<uuid>`, `allmanga:<ref>`, `asurascans:<slug>`, `mangapill:<id>`.
// Bare ids are treated as MangaDex for backwards compatibility with any old
// links that were stored without a prefix.
export function splitId(id) {
  const s = String(id || '')
  const i = s.indexOf(':')
  if (i === -1) return { provider: 'mangadex', ref: s }
  const name = s.slice(0, i)
  return {
    provider: PROVIDERS[name] ? name : 'mangadex',
    ref: s.slice(i + 1),
  }
}

function isEmpty(res) {
  if (!res) return true
  if (Array.isArray(res.data)) return res.data.length === 0
  return res.data == null
}

async function withFallback(fn) {
  let lastError = null
  for (const name of FALLBACK_ORDER) {
    try {
      const res = await fn(PROVIDERS[name])
      if (!isEmpty(res)) return { ...res, provider: name }
      lastError = new Error(`${name}: no results`)
    } catch (err) {
      lastError = err
      console.error(`[manga] ${name} failed:`, err.message)
    }
  }
  throw lastError || new Error('All manga providers failed')
}

// ── Cross-provider result merging ─────────────────────────────

function dedupeByTitle(items) {
  const seen = new Map()
  for (const item of items) {
    const key = normalizeTitle(item.title)
    if (!key) continue
    if (!seen.has(key)) seen.set(key, item) // first occurrence wins (MangaDex first)
  }
  return [...seen.values()]
}

// When both "Solo Leveling" and "Solo Leveling (Book Version)" appear in the
// same result set, drop the "(Book Version)" duplicate — it's the same series
// re-uploaded on MangaDex and just clutters the grid.
function dropBookVersionDupes(items) {
  const normTitles = new Set(items.map((i) => normalizeTitle(i.title)))
  return items.filter((i) => {
    const m = String(i.title || '').match(/^(.+?)\s*\(book\s*version\)\s*$/i)
    if (!m) return true
    return !normTitles.has(normalizeTitle(m[1]))
  })
}

function settledData(r) {
  if (r.status === 'fulfilled') return r.value
  console.error(`[manga] provider failed:`, r.reason?.message)
  return { data: [], total: 0 }
}

// Fetch every provider at once, merge, and re-rank by how well each result
// matches the query (exact/subset titles first). Each item keeps its opaque
// prefixed id, so detail/chapters still route to the right provider.
async function mergeSearch(query, limit, offset) {
  // Fetch extra from each provider because deduping can shrink the set.
  const want = Math.max(limit * 2, 30)
  const settled = await Promise.allSettled(
    MERGE_ORDER.map((name) => PROVIDERS[name].search(query, want, offset))
  )
  const results = settled.flatMap((r) => settledData(r).data)
  const merged = dropBookVersionDupes(dedupeByTitle(results))
  const q = String(query || '')
  merged.sort((a, b) => {
    const sa = titleScore(q, a.title)
    const sb = titleScore(q, b.title)
    if (sa !== sb) return sb - sa
    return a.provider === 'mangadex' ? -1 : 1
  })
  const total = Math.max(...settled.map((r) => (r.status === 'fulfilled' ? r.value.total : 0)))
  return { data: merged.slice(0, limit), total }
}

// Interleave the independently-ranked lists round-robin (md[0], am[0], t1[0],
// as[0], md[1], ...) with title dedupe, so curated lists mix Japanese mainstream
// with manhwa/webtoon titles that may only rank on one provider.
async function mergeLists(fetchByName, limit) {
  const settled = await Promise.allSettled(MERGE_ORDER.map(fetchByName))
  const lists = Object.fromEntries(
    MERGE_ORDER.map((name, i) => [name, settledData(settled[i]).data])
  )
  const interleaved = []
  const seen = new Set()
  const len = Math.max(...MERGE_ORDER.map((name) => lists[name].length))
  for (let i = 0; i < len; i++) {
    for (const name of MERGE_ORDER) {
      const item = lists[name][i]
      if (!item) continue
      const key = normalizeTitle(item.title)
      if (!key || seen.has(key)) continue
      seen.add(key)
      interleaved.push(item)
    }
  }
  const total = Math.max(...MERGE_ORDER.map((name) => {
    const r = settled[MERGE_ORDER.indexOf(name)]
    return r.status === 'fulfilled' ? r.value.total : 0
  }))
  return { data: interleaved.slice(0, limit), total }
}

export async function search(query, limit = 20, offset = 0) {
  return mergeSearch(query, limit, offset)
}

export async function trending(limit = 20, offset = 0) {
  return mergeLists((name) => PROVIDERS[name].trending(limit, offset), limit)
}

export async function latest(limit = 20, offset = 0) {
  return mergeLists((name) => PROVIDERS[name].latest(limit, offset), limit)
}

export async function random() {
  return withFallback((p) => p.random())
}

export async function lookup(candidates, strict = false) {
  for (const name of LOOKUP_ORDER) {
    try {
      const found = await PROVIDERS[name].lookup(candidates, strict)
      if (found) return { data: found, provider: name }
    } catch (err) {
      console.error(`[manga] ${name} lookup failed:`, err.message)
    }
  }
  return { data: null, provider: null }
}

export async function detail(id) {
  const { provider, ref } = splitId(id)
  return PROVIDERS[provider].detail(ref)
}

export async function chapters(id, lang = 'en', limit = 100, offset = 0) {
  const { provider, ref } = splitId(id)
  return PROVIDERS[provider].chapters(ref, lang, limit, offset)
}

export async function pages(chapterId) {
  const { provider, ref } = splitId(chapterId)
  return PROVIDERS[provider].pages(ref)
}
