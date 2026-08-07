// Reader settings: schema, defaults, and persistence.
//
// The schema is the single source of truth for what the reader settings panel
// renders. Adding a future option only requires a new entry here plus wiring
// the effect in MangaReader that consumes it.

import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const STORAGE_KEY = 'mangaReaderSettings'

export const DEFAULT_READER_SETTINGS = {
  readingMode: 'single',
  theme: 'dark',
  zoom: 'fitWidth',
  freeZoom: 1,
  pageDirection: 'ltr',
  orientation: 'free',
  tapZones: 'horizontal',
  keepScreenAwake: false,
  autoHideControls: true,
  rememberLastPage: true,
  showPageNumber: true,
  showReadingProgress: true,
  doubleTapToZoom: true,
  highQualityImages: false,
  dataSaver: true,
  cropBorders: false,
  sharpenImages: false,
}

export const READER_SETTING_GROUPS = [
  {
    id: 'reading',
    title: 'Reading',
    items: ['readingMode', 'pageDirection', 'orientation', 'tapZones'],
  },
  {
    id: 'quality',
    title: 'Display & Quality',
    items: ['theme', 'zoom', 'doubleTapToZoom', 'highQualityImages', 'dataSaver', 'cropBorders', 'sharpenImages'],
  },
  {
    id: 'interface',
    title: 'Interface & Tools',
    items: ['autoHideControls', 'rememberLastPage', 'showPageNumber', 'showReadingProgress', 'keepScreenAwake'],
  },
]

export const READER_SETTINGS_SCHEMA = {
  readingMode: {
    label: 'Reading Mode',
    type: 'segmented',
    options: [
      { value: 'single', label: 'Single Page' },
      { value: 'pagedLtr', label: 'Paged LTR' },
      { value: 'pagedRtl', label: 'Paged RTL' },
      { value: 'longStrip', label: 'Long Strip' },
      { value: 'longStripGap', label: 'Strip + Gaps' },
      { value: 'webtoon', label: 'Webtoon' },
    ],
  },
  theme: {
    label: 'Reader Theme',
    type: 'segmented',
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'oled', label: 'OLED' },
      { value: 'light', label: 'Light' },
      { value: 'sepia', label: 'Sepia' },
    ],
  },
  zoom: {
    label: 'Zoom',
    type: 'segmented',
    options: [
      { value: 'fitWidth', label: 'Fit Width' },
      { value: 'fitHeight', label: 'Fit Height' },
      { value: 'original', label: 'Original' },
      { value: 'free', label: 'Free' },
    ],
  },
  pageDirection: {
    label: 'Page Direction',
    type: 'segmented',
    options: [
      { value: 'ltr', label: 'LTR' },
      { value: 'rtl', label: 'RTL' },
    ],
  },
  orientation: {
    label: 'Orientation',
    type: 'segmented',
    options: [
      { value: 'free', label: 'Free' },
      { value: 'portrait', label: 'Portrait' },
      { value: 'landscape', label: 'Landscape' },
      { value: 'lockedPortrait', label: 'Locked Portrait' },
      { value: 'lockedLandscape', label: 'Locked Landscape' },
    ],
  },
  tapZones: {
    label: 'Tap Zones',
    type: 'segmented',
    options: [
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Vertical' },
      { value: 'both', label: 'Both' },
    ],
  },
  keepScreenAwake: { label: 'Keep Screen Awake', description: 'Prevents the display from sleeping while reading', type: 'toggle' },
  autoHideControls: { label: 'Auto Hide Controls', description: 'Hide the reader bars after a few seconds of inactivity', type: 'toggle' },
  rememberLastPage: { label: 'Remember Last Page', description: 'Resume each chapter where you left off', type: 'toggle' },
  showPageNumber: { label: 'Show Page Number', description: 'Display the current page count in the reader bars', type: 'toggle' },
  showReadingProgress: { label: 'Show Reading Progress', description: 'Show a thin progress bar at the top of the reader', type: 'toggle' },
  doubleTapToZoom: { label: 'Double Tap to Zoom', description: 'Double tap a page to magnify it', type: 'toggle' },
  highQualityImages: { label: 'High Quality Images', description: 'Always load full-resolution pages instead of data-saver images', type: 'toggle' },
  dataSaver: { label: 'Data Saver', description: 'Use lighter data-saver images when available', type: 'toggle' },
  cropBorders: { label: 'Crop Borders', description: 'Trim the page edges for an immersive look', type: 'toggle' },
  sharpenImages: { label: 'Sharpen Images', description: 'Boost contrast to make line art crisper', type: 'toggle' },
}

const VALID_KEYS = new Set(Object.keys(READER_SETTINGS_SCHEMA))

export function isReaderSettingKey(key) {
  return VALID_KEYS.has(key)
}

function pickValid(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!VALID_KEYS.has(key)) continue
    if (typeof value === 'boolean') {
      if (typeof DEFAULT_READER_SETTINGS[key] === 'boolean') out[key] = value
    } else if (typeof value === 'string' || typeof value === 'number') {
      out[key] = value
    }
  }
  return out
}

export function mergeReaderSettings(...sources) {
  return { ...DEFAULT_READER_SETTINGS, ...sources.filter(Boolean).map(pickValid).reduce((a, b) => ({ ...a, ...b }), {}) }
}

export function loadReaderSettings(remote = null) {
  let local = {}
  try {
    local = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { /* silent */ }
  // Older saves only stored `dataSaver` — merge lets defaults fill the rest.
  return mergeReaderSettings(local, remote)
}

export function saveReaderSettingsLocal(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* silent */ }
}

export async function pushReaderSettingsRemote(uid, settings) {
  if (!uid) return
  try {
    await updateDoc(doc(db, 'users', uid), { readerSettings: settings })
  } catch { /* silent: local save still applies */ }
}

const LAST_PAGE_KEY = 'mangaReaderLastPage'

export function loadLastPage(chapterId) {
  try {
    const map = JSON.parse(localStorage.getItem(LAST_PAGE_KEY) || '{}')
    return typeof map[chapterId] === 'number' ? map[chapterId] : null
  } catch { return null }
}

export function saveLastPage(chapterId, page) {
  try {
    const map = JSON.parse(localStorage.getItem(LAST_PAGE_KEY) || '{}')
    map[chapterId] = page
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify(map))
  } catch { /* silent */ }
}
