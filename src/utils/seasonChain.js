// Season chain builder: AniList models seasons/franchises as separate entries
// connected by PREQUEL/SEQUEL relations. This walks those edges from the
// current entry and returns an ordered [S1, S2, …] list so the UI can present
// a franchise as one show with a season switcher.
//
// Entries are cached per session, so revisiting a title (or any sibling
// season) costs no extra API calls.

import { fetchMediaById } from '../api/anilist'

const entryCache = new Map()

// Only mainline show entries count as seasons. OVAs/SPECIALs/MOVIE
// compilations are frequently wired in as PREQUEL/SEQUEL edges (e.g. Attack
// on Titan's Kuinaki Sentaku OVA) but don't belong in a season switcher.
const SEASON_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA'])

function isSeasonEntry(edge) {
  if (!edge?.id) return false
  // A mainline season always runs multiple episodes. Single-episode entries
  // wired in as PREQUEL/SEQUEL are specials, not seasons (e.g. One Piece's
  // PREQUEL "MONSTERS" ONA hijacked Season 1 and left the real show as a
  // dead "Season 2" chip).
  if (Number.isFinite(edge.episodes) && edge.episodes < 2) return false
  // Unknown format (older cache shapes / missing data) — keep it, safer than
  // dropping a real season.
  return !edge.format || SEASON_FORMATS.has(edge.format)
}

async function getEntry(id) {
  const key = String(id)
  if (entryCache.has(key)) return entryCache.get(key)
  const entry = fetchMediaById(key)
    .then((a) => (a ? { id: String(a.id), title: a.title, relations: a.relations || [] } : null))
    .catch(() => null)
  entryCache.set(key, entry)
  return entry
}

// Follow one relation type forward (SEQUEL → later entries, PREQUEL → earlier).
async function walk(fromId, relType, maxDepth = 8) {
  const out = []
  let cur = fromId
  const seen = new Set([String(fromId)])
  for (let d = 0; d < maxDepth; d += 1) {
    const entry = await getEntry(cur)
    if (!entry) break
    // First matching mainline-format edge wins — alternate continuations,
    // spin-offs and OVA side stories are ignored.
    const nextEdge = (entry.relations || []).find(
      (r) => r.type === relType && isSeasonEntry(r) && !seen.has(String(r.id))
    )
    if (!nextEdge) break
    seen.add(String(nextEdge.id))
    out.push({ id: String(nextEdge.id), title: nextEdge.title })
    cur = nextEdge.id
  }
  return out
}

/**
 * Returns [{ id, title, number }] ordered oldest → newest season, including
 * the current entry, or [] when the title has no prequel/sequel family.
 */
export async function buildSeasonChain(animeId) {
  if (!animeId) return []
  const self = await getEntry(animeId)
  if (!self) return []

  const hasFamily = (self.relations || []).some(
    (r) => (r.type === 'PREQUEL' || r.type === 'SEQUEL') && isSeasonEntry(r)
  )
  if (!hasFamily) return []

  const [sequels, prequels] = await Promise.all([
    walk(animeId, 'SEQUEL'),
    walk(animeId, 'PREQUEL'),
  ])

  const chain = [...prequels.slice().reverse(), self, ...sequels]
  if (chain.length <= 1) return []
  return chain.map((s, i) => ({ ...s, number: i + 1 }))
}
