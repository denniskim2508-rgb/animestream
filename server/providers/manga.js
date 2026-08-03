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
import { validPageUrls } from './interface.js'
import { rememberProvider, rememberedProvider } from './prefs.js'

// Every adapter is normalized onto the shared interface (interface.js) so the
// manager can route and fall back between providers uniformly.
const PROVIDERS = {
  mangadex: mangadex.provider,
  allmanga: allmanga.provider,
  asurascans: asurascans.provider,
  mangapill: mangapill.provider,
  kitsu: kitsu.provider,
}
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
  let primary
  try {
    primary = await PROVIDERS[provider].chapters(ref, lang, limit, offset)
  } catch (err) {
    console.error(`[manga] ${provider} chapters failed:`, err.message)
    primary = { data: [], total: 0 }
  }
  if (!isEmpty(primary)) return { ...primary, provider }

  // The owning provider has no readable chapters here (licensed/removed/external
  // chapters only). First try a previously remembered fallback provider for this
  // manga id — repeat visits skip the expensive cross-provider search entirely.
  const byId = rememberedProvider(id)
  if (byId?.provider && byId.provider !== provider && byId.sourceId) {
    try {
      const res = await PROVIDERS[byId.provider].chapters(splitId(byId.sourceId).ref, lang, limit, offset)
      if (!isEmpty(res)) {
        rememberProvider(id, byId.provider, byId.sourceId)
        return { ...res, provider: byId.provider, source: byId.sourceId }
      }
      console.warn(`[manga] remembered provider ${byId.provider} no longer serves chapters for ${id}`)
    } catch (err) {
      console.error(`[manga] remembered provider ${byId.provider} chapters failed:`, err.message)
    }
  }

  // No memory for this exact id — find the same title on another provider. A
  // title-keyed memory hit covers the same series reached via a different
  // provider card, so check that before searching every provider.
  try {
    const det = await PROVIDERS[provider].detail(ref)
    const d = det?.data
    const seen = new Set()
    for (const title of [d?.title, ...(Array.isArray(d?.altTitles) ? d.altTitles : [])]) {
      if (!title) continue
      const key = normalizeTitle(title)
      if (!key || seen.has(key)) continue
      seen.add(key)

      const byTitle = rememberedProvider(key)
      if (byTitle?.provider && byTitle.provider !== provider && byTitle.sourceId) {
        try {
          const res = await PROVIDERS[byTitle.provider].chapters(splitId(byTitle.sourceId).ref, lang, limit, offset)
          if (!isEmpty(res)) {
            rememberProvider(id, byTitle.provider, byTitle.sourceId)
            return { ...res, provider: byTitle.provider, source: byTitle.sourceId }
          }
        } catch (err) {
          console.error(`[manga] remembered provider ${byTitle.provider} chapters failed:`, err.message)
        }
      }

      const src = await findChapterSource(title, provider)
      if (!src) continue
      const res = await PROVIDERS[src.name].chapters(splitId(src.id).ref, lang, limit, offset)
      if (!isEmpty(res)) {
        rememberProvider(id, src.name, src.id)
        rememberProvider(key, src.name, src.id)
        return { ...res, provider: src.name, source: src.id }
      }
    }
  } catch (err) {
    console.error('[manga] chapter fallback failed:', err.message)
  }
  return { ...primary, provider }
}

// Search each readable provider for the closest title match so the chapter
// fallback lands on the same series and not a sequel or spin-off. Exact and
// strict word-subset matches (titleScore) are preferred; a fuzzy Dice score is
// used for titles that differ only by localization (e.g. "wa Koi o Suru" vs
// "wa Koi wo Suru") where a strict match would miss the same series.
async function findChapterSource(title, excludeProvider) {
  const best = { score: 0, src: null }
  for (const name of FALLBACK_ORDER) {
    if (name === excludeProvider) continue
    try {
      const res = await PROVIDERS[name].search(title, 20, 0)
      for (const item of res.data) {
        const score = Math.max(titleScore(title, item.title), fuzzyTitleScore(title, item.title))
        if (score > best.score) {
          best.score = score
          best.src = { name, id: item.id }
        }
      }
    } catch (err) {
      console.error(`[manga] ${name} chapter-source search failed:`, err.message)
    }
  }
  return best.score >= 0.6 ? best.src : null
}

function fuzzyTitleScore(query, title) {
  if (titleScore(query, title)) return 0
  const a = normalizeTitle(query).split(' ').filter(Boolean)
  const b = normalizeTitle(title).split(' ').filter(Boolean)
  if (!a.length || !b.length) return 0
  const common = a.filter((w) => b.includes(w)).length
  return (common * 2) / (a.length + b.length)
}

// Recover the owning manga's opaque id from a chapter id where possible.
// MangaDex chapter ids are chapter uuids, so the caller passes the manga id.
function deriveMangaId(chapterId) {
  const s = String(chapterId || '')
  const i = s.indexOf(':')
  if (i === -1) return null
  const provider = s.slice(0, i)
  const rest = s.slice(i + 1)
  if (!rest) return null
  const [first] = rest.split(':')
  if (!first) return null
  if (provider === 'allmanga' || provider === 'asurascans' || provider === 'mangapill') {
    return `${provider}:${first}`
  }
  return null
}

function deriveChapterNum(chapterId) {
  const s = String(chapterId || '')
  const m = s.match(/chapter-([\d.]+)/i)
  if (m) return parseFloat(m[1])
  const i = s.indexOf(':')
  if (i === -1) return null
  const provider = s.slice(0, i)
  const rest = s.slice(i + 1)
  if (provider === 'allmanga') {
    const [, ch] = rest.split(':')
    return ch != null ? parseFloat(ch) : null
  }
  return null
}

// Pages came back empty or with unusable URLs (e.g. AllManga now captcha-gates
// chapter reads). Resolve the same chapter number on another provider for the
// same series so the reader renders real pages instead of a black screen.
async function fallbackPages(chapterId, provider, mangaId, chapterNum) {
  const ownManga = mangaId || deriveMangaId(chapterId)
  if (!ownManga) {
    console.error(`[manga] pages fallback: no mangaId for ${chapterId}`)
    return null
  }

  let title
  let altTitles = []
  try {
    const d = (await PROVIDERS[splitId(ownManga).provider].detail(splitId(ownManga).ref))?.data
    title = d?.title
    altTitles = Array.isArray(d?.altTitles) ? d.altTitles : []
  } catch (err) {
    console.error('[manga] pages fallback: detail failed:', err.message)
    return null
  }
  if (!title) {
    console.error('[manga] pages fallback: no title to match on')
    return null
  }

  // Resolve the chapter number: caller-supplied, derived from the id, or for
  // MangaDex look it up by matching the chapter uuid in the feed.
  let num = chapterNum
  if (num == null) {
    if (provider === 'mangadex') {
      try {
        const { data } = await PROVIDERS.mangadex.chapters(splitId(ownManga).ref, 'en', 500, 0)
        const cur = data.find((c) => splitId(c.id).ref === chapterId.slice('mangadex:'.length))
        if (cur?.chapter != null) num = cur.chapter
      } catch (err) {
        console.error('[manga] pages fallback: mangadex chapter lookup failed:', err.message)
      }
    } else {
      num = deriveChapterNum(chapterId)
    }
  }
  if (num == null) {
    console.error(`[manga] pages fallback: could not resolve chapter number for ${chapterId}`)
    return null
  }

  const seen = new Set()
  for (const t of [title, ...altTitles]) {
    if (!t) continue
    const key = normalizeTitle(t)
    if (!key || seen.has(key)) continue
    seen.add(key)
    for (const name of FALLBACK_ORDER) {
      if (name === provider) continue
      try {
        const res = await PROVIDERS[name].search(t, 20, 0)
        let best = null
        let bestScore = 0
        for (const item of res.data) {
          const score = Math.max(titleScore(t, item.title), fuzzyTitleScore(t, item.title))
          if (score > bestScore) {
            bestScore = score
            best = item
          }
        }
        if (!best || bestScore < 0.6) continue
        const { data } = await PROVIDERS[name].chapters(splitId(best.id).ref, 'en', 500, 0)
        const match = data.find((c) => c.chapter != null && Math.abs(c.chapter - num) < 0.001)
        if (!match) continue
        const pagesRes = await PROVIDERS[name].pages(splitId(match.id).ref)
        if (validPageUrls(pagesRes.pages)) {
          console.log(`[manga] pages fallback ok | chapter=${match.id} | provider=${name} | pages=${pagesRes.pages.length}`)
          return { ...pagesRes, provider: name, source: match.id }
        }
        console.warn(`[manga] pages fallback ${name}: chapter ${match.id} has no readable pages`)
      } catch (err) {
        console.error(`[manga] pages fallback ${name} failed:`, err.message)
      }
    }
  }
  return null
}

export async function pages(chapterId, { mangaId, chapterNum } = {}) {
  const { provider, ref } = splitId(chapterId)
  let primary
  try {
    primary = await PROVIDERS[provider].pages(ref)
  } catch (err) {
    console.error(`[manga] ${provider} pages failed:`, err.message)
    primary = { pages: [], pagesSd: [], hash: null, baseUrl: null }
  }
  if (validPageUrls(primary.pages)) return { ...primary, provider }

  console.warn(`[manga] pages empty/invalid | chapterId=${chapterId} | provider=${provider} | pages=${(primary.pages || []).length}`)
  const fallback = await fallbackPages(chapterId, provider, mangaId, chapterNum)
  if (fallback) {
    const mangaKey = mangaId || deriveMangaId(chapterId)
    if (mangaKey) rememberProvider(mangaKey, fallback.provider, fallback.source)
    return fallback
  }
  return { ...primary, provider }
}
