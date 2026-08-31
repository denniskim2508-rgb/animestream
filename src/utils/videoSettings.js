// Video player settings: schema, defaults, and persistence.
// Persisted under the same `appSettings` key the player already uses for
// autoplay, so the in-player settings panel and the rest of the app share one
// localStorage record.

const STORAGE_KEY = 'appSettings'

export const DEFAULT_VIDEO_SETTINGS = {
  autoplay: true,
  playbackRate: 1,
  autoSkip: true,
  subsDefault: true,
}

const VALID_KEYS = new Set(Object.keys(DEFAULT_VIDEO_SETTINGS))

export function loadVideoSettings() {
  let raw = {}
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { /* silent */ }
  const out = { ...DEFAULT_VIDEO_SETTINGS }
  for (const key of VALID_KEYS) {
    if (raw[key] !== undefined) out[key] = raw[key]
  }
  return out
}

export function saveVideoSetting(key, value) {
  if (!VALID_KEYS.has(key)) return
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    raw[key] = value
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
  } catch { /* silent */ }
}

// Guest-side audio preference ('sub' | 'dub'), used to fill the player's audio
// when a /watch link arrives without an ?audio= param.
const AUDIO_KEY = 'audioPreference'

export function loadAudioPreference() {
  try {
    const v = localStorage.getItem(AUDIO_KEY)
    return v === 'dub' || v === 'sub' ? v : null
  } catch { /* silent */ }
  return null
}

export function saveAudioPreference(value) {
  if (value !== 'dub' && value !== 'sub') return
  try { localStorage.setItem(AUDIO_KEY, value) } catch { /* silent */ }
}
