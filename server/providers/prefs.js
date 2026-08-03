// ── Provider memory ────────────────────────────────────────────
// Remembers which provider ended up serving each manga so repeat visits skip
// the expensive cross-provider fallback search. Preferences are persisted to
// a small JSON file and survive restarts; writes are debounced.
//
// Keys are either an opaque manga id ("mangadex:<uuid>", "asurascans:<slug>")
// or a normalized title, so the same series is recognized across providers.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '.provider-prefs.json')
const SAVE_DEBOUNCE_MS = 500

let data = null
let writeTimer = null

function load() {
  if (data) return data
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    data = {}
  }
  return data
}

function scheduleSave() {
  clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    try {
      fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('[manga] failed to persist provider prefs:', err.message)
    }
  }, SAVE_DEBOUNCE_MS)
}

export function rememberProvider(key, provider, sourceId) {
  if (!key || !provider) return
  const map = load()
  const prev = map[key]
  if (prev?.provider === provider && prev?.sourceId === sourceId) return
  map[key] = { provider, sourceId: sourceId || null, updatedAt: Date.now() }
  scheduleSave()
}

export function rememberedProvider(key) {
  return load()[key] || null
}

// Test helper: drop the in-memory prefs without touching the file.
export function _clearProviderPrefs() {
  clearTimeout(writeTimer)
  writeTimer = null
  data = null
}
