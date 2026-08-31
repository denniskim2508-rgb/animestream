// Appearance preferences for the TV shell. Persisted locally so the choice
// survives reboots; applied as CSS custom properties consumed by cards/grids.
const STORAGE_KEY = 'kx_tv_appearance'

// Widths are CSS px against the ~960px-wide TV viewport. `default` mirrors
// the AniLili reference (~360 physical px at DPR 2 → ~4.5 posters visible).
export const POSTER_SIZES = {
  small: { label: 'Small', width: 136 },
  medium: { label: 'Medium', width: 160 },
  default: { label: 'Default', width: 184 },
  large: { label: 'Large', width: 224 },
}

export function loadPosterSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const value = raw ? JSON.parse(raw).posterSize : null
    return POSTER_SIZES[value] ? value : 'default'
  } catch {
    return 'default'
  }
}

export function applyPosterSize(size) {
  const conf = POSTER_SIZES[size] || POSTER_SIZES.default
  document.documentElement.style.setProperty('--kx-card-w', `${conf.width}px`)
}

export function savePosterSize(size) {
  if (!POSTER_SIZES[size]) return
  try {
    let obj = {}
    try { obj = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} } catch { /* reset */ }
    obj.posterSize = size
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch { /* storage unavailable */ }
  applyPosterSize(size)
}
