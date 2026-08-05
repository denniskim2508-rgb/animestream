// Fandom wiki episode→chapter scraper (dev-time tool + reusable module).
//
// Series wikis store each episode's manga adaptation in a page infobox, but the
// shape differs per wiki. Per-wiki configs (WIKIS) describe how to read them:
//   naruto:     {{Infobox/Naruto/Episode |episode=364 |shippuden=Yes |chapters=613, 614, 615}}
//               A missing `chapters` field means the episode is anime-original (filler).
//   windbreaker:{{Infobox episode |season=1 |number=3 |manga chapter=[[Chapter 3 (Wind Breaker)|Chapter 3]]}}
//
// This module:
//   1. Lists every page in a wiki category (Category:Episodes).
//   2. Fetches wikitext in batches of 50 via the MediaWiki API.
//   3. Extracts { episode, chapters, series } per page using the wiki config.
//   4. Builds the flat { series, episodes } maps used by /api/manga/adaptation.
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

// Per-wiki scraper config. `seriesOf(fields)` maps the extracted infobox fields
// to a series key (see `files`), or null to skip the page.
const WIKIS = {
  naruto: {
    apiBase: 'https://naruto.fandom.com/api.php',
    category: 'Category:Episodes',
    infobox: 'Infobox/Naruto/Episode',
    episodeField: 'episode',
    chaptersField: 'chapters',
    wikilinks: false,
    files: {
      naruto: { file: 'naruto.json', title: 'Naruto' },
      'naruto-shippuden': { file: 'naruto-shippuden.json', title: 'Naruto Shippuden' },
    },
    seriesOf: (fields) => {
      if (fields.boruto === 'Yes') return null
      return fields.shippuden === 'Yes' ? 'naruto-shippuden' : 'naruto'
    },
  },
  windbreaker: {
    apiBase: 'https://wind-breaker.fandom.com/api.php',
    category: 'Category:Episodes',
    infobox: 'Infobox episode',
    episodeField: 'number',
    chaptersField: 'manga chapter',
    wikilinks: true,
    files: {
      s1: { file: 'wind-breaker-s1.json', title: 'Wind Breaker (Season 1)' },
      s2: { file: 'wind-breaker-s2.json', title: 'Wind Breaker (Season 2)' },
    },
    seriesOf: (fields) => {
      if (fields.season === '1') return 's1'
      if (fields.season === '2') return 's2'
      return null
    },
  },
}

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

// Parse a chapters value written as wikilink(s), e.g.
//   [[Chapter 1 (Wind Breaker)|Chapter 1]] (pp. 26 – 35)
// using the display text after the last `|` (or the whole link) and its first number.
function parseWikilinkChapters(raw) {
  const s = String(raw || '').trim()
  if (!s) return []
  const out = []
  for (const m of s.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const link = m[1].split('|')
    const display = link[link.length - 1].trim()
    const num = display.match(/\d+/)
    if (num) out.push(Number(num[0]))
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

// Extract an episode infobox from wikitext using a wiki config. Values run to
// end-of-line (they may contain `|`, e.g. a wikilink `[[X|Chapter 1]]`).
export function extractEpisode(wikitext, config) {
  const inner = extractTemplateInner(wikitext, `{{${config.infobox}`)
  if (inner == null) return null
  const fields = {}
  for (const fm of inner.matchAll(/\|\s*([A-Za-z][A-Za-z0-9 ]*)\s*=\s*([^\n]*)/g)) {
    fields[fm[1].trim().toLowerCase()] = fm[2].trim()
  }
  const episode = Number(fields[config.episodeField])
  if (!episode) return null
  const raw = fields[config.chaptersField]
  const chapters = config.wikilinks ? parseWikilinkChapters(raw) : parseChapters(raw)
  return { episode, fields, chapters }
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

// Scrape a wiki category into series episode maps, grouped by config.seriesOf.
export async function scrapeWiki(config, onBatch) {
  const titles = await listCategoryMembers(config.apiBase, config.category)
  const maps = {}
  const skipped = []

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const contents = await fetchWikitext(config.apiBase, batch)
    for (const [title, wikitext] of contents) {
      const ep = extractEpisode(wikitext, config)
      if (!ep) {
        skipped.push(`${title} (no episode number)`)
        continue
      }
      const seriesKey = config.seriesOf(ep.fields)
      if (!seriesKey) {
        skipped.push(`${title} (no matching series)`)
        continue
      }
      if (!maps[seriesKey]) maps[seriesKey] = {}
      const key = String(ep.episode)
      const existing = maps[seriesKey][key]
      if (existing && existing.chapters.length) continue
      maps[seriesKey][key] = {
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
  for (const map of Object.values(maps)) {
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

// Back-compat wrapper for the original Naruto-only entry point.
export async function scrapeFandom({ apiBase, category, onBatch }) {
  const { maps, skipped } = await scrapeWiki({ ...WIKIS.naruto, apiBase, category }, onBatch)
  return { maps: { naruto: maps.naruto || {}, 'naruto-shippuden': maps['naruto-shippuden'] || {} }, skipped }
}

function writeMap(file, series, title, episodes) {
  const out = { series, title, episodes }
  const target = path.join(MAPS_DIR, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(out, null, 2))
  return target
}

async function runWiki(name) {
  const config = WIKIS[name]
  const { maps, skipped } = await scrapeWiki(config, (done, total) =>
    process.stdout.write(`\r[${name}] fetched ${done}/${total}...`)
  )

  console.log(`\n[${name}]`)
  for (const key of Object.keys(maps)) {
    const { file, title } = config.files[key]
    const eps = Object.keys(maps[key]).length
    const fillers = Object.values(maps[key]).filter((e) => e.filler).length
    const target = writeMap(file, key, title, maps[key])
    console.log(`  ${title}: ${eps} episodes (${fillers} filler) -> ${file}`)
    console.log(`  wrote ${target}`)
  }
  console.log(`  skipped: ${skipped.length ? skipped.join('; ') : 'none'}`)
}

// CLI: `node server/scrapers/fandom.js`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runWiki('naruto')
    .then(() => runWiki('windbreaker'))
    .catch((err) => {
      console.error('scrape failed:', err)
    })
}
