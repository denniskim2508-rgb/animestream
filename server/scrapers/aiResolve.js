// Run the AI adaptation resolver standalone (no HTTP) and print the outcome.
// Requires OPENAI_API_KEY in .env.
//
//   node server/scrapers/aiResolve.js <animeId> <episode>

import { resolveAdaptation, resolverEnabled } from '../services/adaptationResolver.js'

const [animeId, episode] = process.argv.slice(2)
if (!animeId || !episode) {
  console.error('usage: node server/scrapers/aiResolve.js <animeId> <episode>')
  process.exit(1)
}

if (!resolverEnabled()) {
  console.error('OPENAI_API_KEY is not set in .env — resolver disabled.')
  process.exit(1)
}

const started = Date.now()
const outcome = await resolveAdaptation(animeId, episode)
console.log(`\n[aiResolve] ${animeId} ep ${episode} in ${Date.now() - started}ms`)
console.log(`ok: ${outcome.ok}`)
if (outcome.confidence) console.log(`confidence: ${outcome.confidence}`)
if (outcome.message) console.log(`message: ${outcome.message}`)
if (outcome.result) console.log(`result: ${JSON.stringify(outcome.result, null, 2)}`)
if (outcome.parsed) {
  console.log(`parsed: ${JSON.stringify(outcome.parsed, null, 2)}`)
}
