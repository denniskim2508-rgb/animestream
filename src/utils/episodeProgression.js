// Shared episode-progression service used by BOTH the web player and the TV
// player. It owns the two invariants that historically broke autoplay and
// caused double-skips:
//
//   1. The next episode is always resolved from an explicit, sorted episode
//      list by index — never by `current + 1` arithmetic.
//   2. Exactly one transition may be armed per (animeId, episode) pair. Every
//      trigger path ('ended' event, countdown reaching zero, Watch Now button,
//      a stray interval tick) funnels through `tryArm()`, which is single-flight
//      per key. StrictMode double-mounts are safe because the lock lives in
//      module scope, not React state.

const armed = new Map()

function keyOf(animeId, episode) {
  return `${String(animeId)}#${Number(episode)}`
}

export function buildEpisodeList(totalEpisodes, currentEp, providerList = null) {
  // Prefer the provider's REAL episode numbers, normalized and sorted — never
  // trust provider ordering or assume 1..N matches what actually exists
  // (missing entries, .5 specials, absolute numbering across seasons).
  let list = Array.isArray(providerList)
    ? providerList.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : []
  if (list.length === 0 && totalEpisodes > 0) {
    list = Array.from({ length: totalEpisodes }, (_, i) => i + 1)
  }
  if (list.length === 0) return [currentEp]
  if (Number.isFinite(currentEp) && currentEp > 0 && !list.includes(currentEp)) {
    list.push(currentEp) // keep the episode being watched reachable by index
  }
  list.sort((a, b) => a - b)
  return list
}

export function getNextEpisode(allEpisodes, currentEp) {
  const idx = allEpisodes.findIndex((e) => e === currentEp)
  if (idx >= 0 && idx < allEpisodes.length - 1) return allEpisodes[idx + 1]
  return null
}

export function getPrevEpisode(allEpisodes, currentEp) {
  const idx = allEpisodes.findIndex((e) => e === currentEp)
  if (idx > 0) return allEpisodes[idx - 1]
  return null
}

/**
 * Arm a transition for the given anime/episode. Returns true exactly once per
 * key; every later call with the same key returns false until the transition
 * completes or is cancelled. This is the fix for the "skips two episodes" bug:
 * duplicate triggers (double 'ended', overlay countdown racing the event,
 * re-rendered effects) collapse into a single navigation.
 */
export function tryArm(animeId, currentEp) {
  const key = keyOf(animeId, currentEp)
  if (armed.has(key)) return false
  armed.set(key, Date.now())
  return true
}

export function complete(animeId, currentEp) {
  armed.delete(keyOf(animeId, currentEp))
}

/** Manual jumps cancel any pending/armed transition so it can never fire. */
export function cancel(animeId, currentEp) {
  armed.delete(keyOf(animeId, currentEp))
}

export function cancelAll() {
  armed.clear()
}
