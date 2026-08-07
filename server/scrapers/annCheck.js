// Validate the SERIES registry (server/services/adaptationService.js) against
// the Anime News Network encyclopedia and print a report. ANN cannot tell us
// per-episode chapter coverage, but it does confirm the anime↔manga link and
// the episode count — a guard against stale/mistyped map data.
//
//   node server/scrapers/annCheck.js
//
// For each registered series it reports the best ANN match (id, type, season
// precision, ANN episode count vs the map's episode count) and the source manga
// ANN says the anime is adapted from.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listSeries } from '../services/adaptationService.js'
import { searchByName, matchAnime, sourceMangaOf, normalizeTitle } from '../services/annService.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAPS_DIR = path.join(__dirname, '..', 'cache', 'maps')

function mapEpisodeCount(file) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, file), 'utf8'))
    return Object.keys(data.episodes || {}).length
  } catch {
    return null
  }
}

function seasonHint(key) {
  const m = key.match(/-s(\d+)$/)
  return m ? Number(m[1]) : null
}

function matchByPrecision(candidates, hint) {
  if (!hint) return null
  const order = { TV: 1, 'TV 2': 2, 'TV 3': 3, 'TV 4': 4, 'TV 5': 5 }
  const wanted = `TV${hint > 1 ? ` ${hint}` : ''}`
  return candidates.find((a) => order[a.precision] === hint || a.precision === wanted) || null
}

let failures = 0

for (const series of listSeries()) {
  let ann
  try {
    ann = await searchByName(normalizeTitle(series.title))
  } catch (err) {
    console.log(`[${series.key}] (${series.anilistId}) ${series.title}`)
    console.log(`  ERROR: ANN lookup failed: ${err.message}`)
    failures++
    continue
  }

  const mapEps = mapEpisodeCount(series.file)
  const hint = seasonHint(series.key)
  const candidates = ann.anime.filter((a) => normalizeTitle(a.name) === normalizeTitle(series.title))
  const matched = matchByPrecision(candidates, hint) || matchAnime(candidates, { title: series.title, expectedEpisodes: mapEps })

  console.log(`[${series.key}] (anilist ${series.anilistId}) ${series.title}`)
  console.log(`  map file: ${series.file} | ${mapEps ?? '?'} episodes`)

  if (!matched) {
    console.log(`  ✗ no ANN anime matched (${candidates.length} candidates by title)`)
    failures++
    continue
  }

  const source = sourceMangaOf(matched, ann.manga)
  const countOk = matched.numEpisodes == null || mapEps == null || matched.numEpisodes === mapEps
  if (!countOk) failures++
  console.log(
    `  ✓ ANN id=${matched.id} type=${matched.type} precision=${matched.precision} eps=${matched.numEpisodes ?? '?'} ${countOk ? '' : `✗ MISMATCH vs map (${mapEps})`}`
  )
  console.log(
    `  adapted from: ${source ? `ANN manga id=${source.id} "${source.title}"` : 'not stated on ANN'}`
  )
  console.log(`  suggested annId: ${matched.id}, episodeCount: ${matched.numEpisodes ?? 'null'}`)
  console.log('')
}

console.log(failures ? `\n${failures} series need attention.` : '\nAll series validated OK.')
