// Anime News Network encyclopedia client (metadata/validation layer for the
// anime→manga mapper).
//
// ANN's encyclopedia does NOT record which manga chapters each anime episode
// adapts — but it does confirm the adaptation relationship and episode counts,
// which we use to validate our per-series maps and to discover the source manga
// for a given anime.
//
// Search results come back as one compact XML document containing the matched
// title plus its franchise neighbours (sequels, source manga, adaptations), e.g.
//
//   <anime id="27706" type="TV" name="Wind Breaker" precision="TV">
//     <related-prev rel="adapted from" id="25676"/>
//     <related-next id="32849" rel="sequel"/>
//     <info type="Main title" lang="EN">Wind Breaker</info>
//     <info type="Number of episodes">13</info>
//   </anime>
//   <manga id="25676" type="manga" name="Wind Breaker">
//     <related-next id="27706" rel="adaptation"/>
//   </manga>
//
// We parse just enough of the XML (records, relations, and a handful of info
// types) with a tiny regex-based parser — no XML dependency required.

import { fetchWithTimeout } from '../utils/http.js'

const API = 'https://cdn.animenewsnetwork.com/encyclopedia/api.xml'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// Normalize ANN / AniList titles for fuzzy matching: lowercase, fold
// diacritics (Shippūden → Shippuden), collapse whitespace/colons, and drop
// trailing " (Season n)" disambiguators.
export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\((?:tv\s*)?season\s*\d+\)/g, '')
    .replace(/[\s_:]+/g, ' ')
    .trim()
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

// Parse `<a b="..." c="..."/>` / `<a b="...">text</a>` attributes and inner text.
function parseTag(tag) {
  const m = tag.match(/^<([a-z-]+)\s+([^>]*?)(\/?)\s*>/i)
  if (!m) return null
  const [, name, attrStr] = m
  const attrs = {}
  for (const am of attrStr.matchAll(/([a-z-]+)="([^"]*)"/gi)) {
    attrs[am[1].toLowerCase()] = decodeEntities(am[2])
  }
  const inner = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('<'))
  return { name, attrs, text: decodeEntities(inner) }
}

// Parse one ANN record body into { relations, info } maps.
function parseRecordBody(body) {
  const relations = []
  const info = {}
  for (const m of body.matchAll(/<related-(?:prev|next)\s+([^>]*?)\/>/g)) {
    const { attrs } = parseTag(`<related ${m[1]}/>`)
    relations.push({ id: attrs.id, rel: attrs.rel })
  }
  for (const m of body.matchAll(/<info\s+([^>]*)>([\s\S]*?)<\/info>/g)) {
    const { attrs, text } = parseTag(`<info ${m[1]}>${m[2]}</info>`)
    const type = attrs.type
    if (!type || type === 'Picture') continue
    if (!(type in info)) info[type] = []
    info[type].push({ lang: attrs.lang, text })
  }
  return { relations, info }
}

// Parse the full api.xml document into { anime, manga } record lists.
export function parseAnnXml(xml) {
  const out = { anime: [], manga: [] }
  for (const m of xml.matchAll(/<(anime|manga)\s+([^>]*?)>([\s\S]*?)<\/(anime|manga)>/g)) {
    const kind = m[1]
    const { attrs } = parseTag(`<${kind} ${m[2]}>`)
    const { relations, info } = parseRecordBody(m[3])
    const episodeInfo = info['Number of episodes']?.[0]
    const titleInfo = info['Main title']?.[0]
    const record = {
      id: attrs.id,
      name: attrs.name,
      type: attrs.type,
      precision: attrs.precision,
      title: titleInfo?.text || attrs.name,
      numEpisodes: episodeInfo ? Number(episodeInfo.text) : null,
      relations,
      info,
    }
    if (kind === 'anime') out.anime.push(record)
    else out.manga.push(record)
  }
  return out
}

async function apiQuery(params) {
  const res = await fetchWithTimeout(
    `${API}?${params}`,
    { headers: { 'User-Agent': BROWSER_UA } },
    { provider: 'ann', label: `ann ${params.slice(0, 60)}`, timeoutMs: 15000, retries: 1 }
  )
  return res.text()
}

// Search ANN by primary title. One call returns the title plus its franchise
// neighbours (source manga via "adapted from", sequels, other adaptations).
export async function searchByName(name) {
  const xml = await apiQuery(`title=~${encodeURIComponent(name)}`)
  return parseAnnXml(xml)
}

// Fetch a single title by ANN encyclopedia id.
export async function getById(id) {
  const xml = await apiQuery(`title=${encodeURIComponent(id)}`)
  return parseAnnXml(xml)
}

// Find the best ANN anime match for a known AniList anime. Matches on
// normalized title and, when given, expected episode count. Returns null if no
// candidate matches.
export function matchAnime(candidates, { title, expectedEpisodes } = {}) {
  const want = normalizeTitle(title)
  const scored = candidates
    .filter((a) => a.type === 'TV' || a.type === 'ONA' || a.type === 'OAV' || a.type === 'OVA')
    .map((a) => {
      let score = normalizeTitle(a.name) === want ? 2 : 0
      if (a.numEpisodes != null && expectedEpisodes != null) {
        if (a.numEpisodes === expectedEpisodes) score += 1
      }
      return { candidate: a, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.candidate || null
}

// The source manga an ANN anime record is adapted from (via "adapted from").
export function sourceMangaOf(animeRecord, allManga) {
  const rel = animeRecord.relations.find((r) => r.rel === 'adapted from')
  if (!rel) return null
  const manga = allManga.find((m) => m.id === rel.id)
  if (manga) return { id: manga.id, name: manga.name, title: manga.title }
  return { id: rel.id, name: rel.id, title: rel.id }
}
