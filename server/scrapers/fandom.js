// Fandom wiki episode→chapter scraper (dev-time tool + reusable module).
//
// Naruto's fandom wiki stores every episode's manga adaptation in a page
// infobox, e.g.:
//   {{Infobox/Naruto/Episode
//   |episode=364
//   |shippuden=Yes
//   |boruto=No
//   |chapters=613, 614, 615
//   }}
// A missing `chapters` field means the episode is anime-original (filler).
//
// This module:
//   1. Lists every page in a wiki category (Category:Episodes).
//   2. Fetches wikitext in batches of 50 via the MediaWiki API.
//   3. Extracts {episode, shippuden, boruto, chapters} per page.
//   4. Builds the flat { series, episodes } map used by /api/manga/adaptation.
//
// Run directly to regenerate the cached JSON maps:
//   node server/scrapers/fandom.js

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchWithTimeout } from '../utils/http.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAPS_DIR = path.join(__dirname, '..', 'cache', 'maps')

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Parse an infobox chapters value: "613, 614, 615", "512-513", "512–513",
// "Ch. 245". Returns a sorted, deduped array of numbers.
export function parseChapters(raw) {
  if (!raw) return []
  const s = String(raw).trim().replace(/[–—]/g, '-')
  if (!s) return []
  const out = []
  for (const part of s.split(',')) {
    const token = part.trim()
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const lo = Math.min(Number(range[1]), Number(range[2]))
      const hi = Math.max(Number(range[1]), Number(range[2]))
      for (let n = lo; n <= hi; n++) out.push(n)
    } else {
      const single = token.match(/\d+/)
      if (single) out.push(Number(single[0]))
    }
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

// Extract the inner content of a template block, honoring nested {{...}} pairs
// (e.g. the infobox `|top={{Wikipedia|...}}` param). Returns the text between
// the template marker and its matching closing braces, or null if not found.
function extractTemplateInner(wikitext, marker) {
  const s = String(wikitext || '')
  const idx = s.indexOf(marker)
  if (idx === -1) return null
  let i = idx + marker.length
  let depth = 1
  let inner = ''
  while (i < s.length) {
    if (s.startsWith('{{', i)) {
      depth++
      i += 2
    } else if (s.startsWith('}}', i)) {
      depth--
      if (depth === 0) return inner
      i += 2
    } else {
      inner += s[i]
      i++
    }
  }
  return null
}

// Extract the Naruto episode infobox from wikitext.
export function extractEpisode(wikitext) {
  const inner = extractTemplateInner(wikitext, '{{Infobox/Naruto/Episode')
  if (inner == null) return null
  const fields = {}
  for (const fm of inner.matchAll(/\|\s*([A-Za-z][A-Za-z0-9 ]*)\s*=\s*([^\n|]*)/g)) {
    fields[fm[1].trim().toLowerCase()] = fm[2].trim()
  }
  const episode = Number(fields.episode)
  if (!episode) return null
  return {
    episode,
    shippuden: fields.shippuden,
    boruto: fields.boruto,
    chapters: parseChapters(fields.chapters),
  }
}

async function apiGet(url, label) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, {
    provider: 'fandom',
    label,
    timeoutMs: 20000,
  })
  return res.json()
}

// Paged category listing via list=categorymembers.
export async function listCategoryMembers(apiBase, category) {
  const titles = []
  let cmcontinue = ''
  do {
    const cont = cmcontinue ? `&cmcontinue=${encodeURIComponent(cmcontinue)}` : ''
    const j = await apiGet(
      `${apiBase}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&format=json&cmlimit=500${cont}`,
      `categorymembers ${titles.length}`
    )
    for (const p of j.query?.categorymembers || []) titles.push(p.title)
    cmcontinue = j.continue?.cmcontinue || ''
  } while (cmcontinue)
  return titles
}

// Fetch wikitext for up to 50 titles at once via prop=revisions&rvslots=main.
export async function fetchWikitext(apiBase, titles) {
  const j = await apiGet(
    `${apiBase}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(titles.join('|'))}`,
    `revisions ${titles.length}`
  )
  const map = new Map()
  for (const p of j.query?.pages || []) {
    const rev = p.revisions?.[0]
    const content = rev?.slots?.main?.content ?? rev?.content
    if (typeof content === 'string') map.set(p.title, content)
  }
  return map
}

// Scrape a wiki category into { naruto, shippuden } episode maps.
export async function scrapeFandom({ apiBase, category, onBatch }) {
  const titles = await listCategoryMembers(apiBase, category)
  const maps = { naruto: {}, shippuden: {} }
  const skipped = []

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const contents = await fetchWikitext(apiBase, batch)
    for (const [title, wikitext] of contents) {
      const ep = extractEpisode(wikitext)
      if (!ep) {
        skipped.push(`${title} (no episode number)`)
        continue
      }
      let series = null
      if (ep.boruto === 'Yes') {
        skipped.push(`${title} (boruto)`)
        continue
      }
      series = ep.shippuden === 'Yes' ? 'shippuden' : 'naruto'
      const key = String(ep.episode)
      const existing = maps[series][key]
      if (existing && existing.chapters.length) continue
      maps[series][key] = {
        chapters: ep.chapters,
        filler: ep.chapters.length === 0,
        firstChapter: ep.chapters.length ? ep.chapters[0] : null,
        lastChapter: ep.chapters.length ? ep.chapters[ep.chapters.length - 1] : null,
        nextChapter: null,
      }
    }
    if (onBatch) onBatch(Math.min(i + 50, titles.length), titles.length)
    if (i + 50 < titles.length) await sleep(120)
  }

  // Number the follow-up chapter for fillers and canon episodes.
  for (const map of [maps.naruto, maps.shippuden]) {
    let pending = 1
    for (const key of Object.keys(map).map(Number).sort((a, b) => a - b)) {
      const e = map[key]
      if (e.filler) e.nextChapter = pending
      else {
        e.nextChapter = e.lastChapter + 1
        pending = e.lastChapter + 1
      }
    }
  }

  return { maps, skipped }
}

function writeMap(file, series, title, episodes) {
  const out = { series, title, episodes }
  const target = path.join(MAPS_DIR, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(out, null, 2))
  return target
}

export async function runNaruto() {
  const apiBase = 'https://naruto.fandom.com/api.php'
  const { maps, skipped } = await scrapeFandom({
    apiBase,
    category: 'Category:Episodes',
    onBatch: (done, total) => process.stdout.write(`\rfetched ${done}/${total}...`),
  })

  const summary = (name, map) => {
    const eps = Object.keys(map).length
    const fillers = Object.values(map).filter((e) => e.filler).length
    return `${name}: ${eps} episodes (${fillers} filler)`
  }
  const narutoFile = writeMap('naruto.json', 'naruto', 'Naruto', maps.naruto)
  const shippudenFile = writeMap('naruto-shippuden.json', 'naruto-shippuden', 'Naruto Shippuden', maps.shippuden)

  console.log('\n\n' + summary('Naruto', maps.naruto))
  console.log(summary('Naruto Shippuden', maps.shippuden))
  console.log('skipped:', skipped.length ? skipped.join('; ') : 'none')
  console.log('wrote', narutoFile)
  console.log('wrote', shippudenFile)
}

// CLI: `node server/scrapers/fandom.js`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runNaruto().catch((err) => {
    console.error('scrape failed:', err)
  })
}
