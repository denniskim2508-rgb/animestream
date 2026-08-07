// Persist an episode→chapter adaptation result to the adaptation store
// (server/cache/adaptations.json). This is the write path for results resolved
// outside the static fandom maps — e.g. a human-verified LLM lookup or a manual
// mapping — so every future GET /api/manga/adaptation returns the saved result.
//
//   node server/scrapers/seedAdaptation.js <animeId> <episode> <nextChapter> [options]
//
// Options:
//   --animeTitle <name>   title to store when the anime isn't in the registry
//   --lastAdapted <n>     last chapter covered by the episode (for filler: omit)
//   --filler              mark the episode as filler (no lastAdaptedChapter)
//   --source <name>       provenance, e.g. "ann", "llm", "manual"
//   --list                print everything currently saved and exit
//   --clear               wipe the store and exit

import { saveAdaptation, listSeries } from '../services/adaptationService.js'
import { getAdaptation, adaptationStats, clearAdaptations } from '../services/adaptationStore.js'

function parseArgs(argv) {
  const args = { positional: [], options: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const name = a.slice(2)
      args.options[name] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true
      if (args.options[name] !== true) i++
    } else {
      args.positional.push(a)
    }
  }
  return args
}

const { positional, options } = parseArgs(process.argv.slice(2))

if (options.list) {
  const stats = adaptationStats()
  const known = listSeries().map((s) => `${s.anilistId} (${s.key})`).join(', ')
  console.log(`adaptation store: ${stats.entries} saved entries across ${stats.animeIds} anime`)
  console.log(`file: ${stats.file}`)
  console.log(`registered series: ${known || 'none'}`)
  process.exit(0)
}

if (options.clear) {
  clearAdaptations()
  console.log('adaptation store cleared.')
  process.exit(0)
}

const [animeId, episode, nextChapter] = positional
if (!animeId || !episode || nextChapter == null) {
  console.error('usage: node server/scrapers/seedAdaptation.js <animeId> <episode> <nextChapter> [--animeTitle T] [--lastAdapted N] [--filler] [--source S]')
  console.error('       node server/scrapers/seedAdaptation.js --list | --clear')
  process.exit(1)
}

const saved = saveAdaptation(animeId, episode, {
  nextChapter: Number(nextChapter),
  lastAdaptedChapter: options.filler ? null : options.lastAdapted != null ? Number(options.lastAdapted) : null,
  filler: Boolean(options.filler),
  animeTitle: options.animeTitle,
  source: options.source || 'cli',
})

console.log(`saved: ${JSON.stringify(saved, null, 2)}`)
const back = getAdaptation(saved.animeId, saved.episode)
console.log(`read-back: ${back ? `nextChapter=${back.nextChapter} (savedAt=${back.savedAt})` : 'MISS'}`)
