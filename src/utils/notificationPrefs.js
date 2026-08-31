// Notification preferences: schema, defaults, and persistence.
// Stored as a nested `notifications` object inside the shared `appSettings`
// localStorage record so the TV and web settings pages stay in sync on the
// same browser/device. Preference storage only — no delivery pipeline.

const STORAGE_KEY = 'appSettings'
const PREFS_KEY = 'notifications'

export const DEFAULT_NOTIFICATION_PREFS = {
  pushEnabled: true,
  newEpisodeAlerts: true,
  airingReminders: true,
  myListUpdates: true,
  continueWatchingReminders: false,
  appAnnouncements: false,
}

const VALID_KEYS = new Set(Object.keys(DEFAULT_NOTIFICATION_PREFS))

export function loadNotificationPrefs() {
  let raw = {}
  try {
    const app = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (app && typeof app[PREFS_KEY] === 'object' && app[PREFS_KEY] !== null) raw = app[PREFS_KEY]
  } catch { /* silent */ }
  const out = { ...DEFAULT_NOTIFICATION_PREFS }
  for (const key of VALID_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key]
  }
  return out
}

export function saveNotificationPrefs(prefs) {
  try {
    const app = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const next = { ...loadNotificationPrefs() }
    for (const key of VALID_KEYS) {
      if (typeof prefs[key] === 'boolean') next[key] = prefs[key]
    }
    app[PREFS_KEY] = next
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app))
  } catch { /* silent */ }
}
