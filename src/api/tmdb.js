import { API_BASE } from './base'

export const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/'

// Fetch TMDB episode metadata for a detail page. The TMDB access token lives
// only on the backend — the client passes the AniList id + title + year and the
// server resolves/returns (or returns matched:false when no confident match).
export async function fetchTMDBEpisodes(anilistId, { title, year } = {}) {
  if (!anilistId || !title) return { matched: false }
  const params = new URLSearchParams({ anilistId: String(anilistId), title })
  if (year) params.set('year', String(year))
  try {
    const res = await fetch(`${API_BASE}/api/tmdb/episodes?${params}`)
    if (!res.ok) return { matched: false }
    return await res.json()
  } catch {
    return { matched: false }
  }
}

// Compose a TMDB still image URL from a stored file_path. Returns null when
// absent so callers can fall back to anime artwork.
export function tmdbStillUrl(stillPath, width = 'w300') {
  return stillPath ? `${TMDB_IMG_BASE}${width}${stillPath}` : null
}
