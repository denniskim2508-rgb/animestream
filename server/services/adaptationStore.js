// Persistent adaptation cache (the "database" for episode→chapter results).
//
// The server has no external DB (Firebase is client-side auth only), so results
// are persisted to a JSON file under server/cache/adaptations.json and loaded
// into memory at boot. Every resolved adaptation is saved here so future
// requests for the same anime+episode return the saved result without
// re-resolving. This is where on-demand/LLM-derived mappings land; the static
// per-series map files under server/cache/maps/ remain the source for series
// covered by the fandom scraper.
//
// The store is a thin wrapper that can be swapped for a real DB (e.g. Mongo)
// without touching the service layer.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cache', 'adaptations.json')

let data = { entries: {} }
let loaded = false

function load() {
  if (loaded) return
  try {
    if (fs.existsSync(FILE)) data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch (err) {
    console.error('[adaptation-store] failed to load, starting empty:', err.message)
  }
  loaded = true
}

function persist() {
  const tmp = `${FILE}.tmp`
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}

export function adaptationKey(animeId, episode) {
  return `${animeId}:${episode}`
}

export function getAdaptation(animeId, episode) {
  load()
  const entry = data.entries[adaptationKey(animeId, episode)]
  return entry ? { ...entry } : null
}

export function setAdaptation(animeId, episode, result) {
  load()
  const k = adaptationKey(animeId, episode)
  const prev = data.entries[k]
  const entry = {
    ...result,
    savedAt: prev?.savedAt || Date.now(),
    updatedAt: Date.now(),
  }
  data.entries[k] = entry
  try {
    persist()
  } catch (err) {
    console.error('[adaptation-store] write failed:', err.message)
  }
  return { ...entry }
}

export function adaptationStats() {
  load()
  const keys = Object.keys(data.entries)
  const byAnime = new Map()
  for (const k of keys) {
    const [animeId] = k.split(':')
    byAnime.set(animeId, (byAnime.get(animeId) || 0) + 1)
  }
  return { entries: keys.length, animeIds: byAnime.size, file: FILE }
}

export function clearAdaptations() {
  load()
  data.entries = {}
  persist()
}
