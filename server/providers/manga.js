// Provider Manager: the single server-side gateway for manga content.
// React never talks to a provider directly — it consumes normalized shapes
// through the /api/manga/* endpoints, and opaque ids like "allmanga:<ref>".
//
// Fallback order: MangaDex (primary) → AllManga (backup). More adapters can
// be added to the registry without touching the API layer.

import * as mangadex from './mangadex.js'
import * as allmanga from './allmanga.js'

const PROVIDERS = { mangadex, allmanga }
const FALLBACK_ORDER = ['mangadex', 'allmanga']

// `mangadex:<uuid>` or `allmanga:<ref>`; bare ids are treated as MangaDex for
// backwards compatibility with any old links that were stored without a prefix.
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

export async function search(query, limit = 20, offset = 0) {
  return withFallback((p) => p.search(query, limit, offset))
}

export async function trending(limit = 20, offset = 0) {
  return withFallback((p) => p.trending(limit, offset))
}

export async function latest(limit = 20, offset = 0) {
  return withFallback((p) => p.latest(limit, offset))
}

export async function random() {
  return withFallback((p) => p.random())
}

export async function lookup(candidates, strict = false) {
  for (const name of FALLBACK_ORDER) {
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
