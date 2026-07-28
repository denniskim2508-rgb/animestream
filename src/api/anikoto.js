const API_BASE = ''

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function searchAnime(query) {
  return apiFetch(`/api/anidap/search?q=${encodeURIComponent(query)}`)
}

export async function getAnimeDetails(anilistId) {
  return apiFetch(`/api/anidap/anime/${anilistId}`)
}

export async function getEpisodes(slug) {
  return apiFetch(`/api/anidap/episodes/${slug}`)
}

export async function getServers(slug, epNum) {
  return apiFetch(`/api/anidap/servers/${slug}/${epNum}`)
}

export async function getSources(slug, epNum, type, providerId) {
  return apiFetch(`/api/anidap/sources/${slug}/${epNum}/${type}/${providerId}`)
}

export async function resolveStream(anilistId, episode, audioMode) {
  const params = new URLSearchParams({
    anilistId: String(anilistId),
    episode: String(episode),
    audio: audioMode || 'sub',
  })
  return apiFetch(`/api/stream/resolve?${params}`)
}

export async function fetchEpisodeAvailability(anilistId, episode) {
  const params = new URLSearchParams({
    anilistId: String(anilistId),
    episode: String(episode),
  })
  return apiFetch(`/api/stream/availability?${params}`)
}

export async function fetchRecentEpisodes() {
  const items = await apiFetch('/api/anidap/recents')
  return items.map(item => ({
    id: String(item.anilistId || item.id),
    title: item.title?.userPreferred || item.title?.english || item.title?.romaji || 'Unknown',
    coverImage: item.coverImage?.large || item.coverImage?.medium || '',
    episodes: item.episodes || 0,
    rating: item.averageScore || null,
    format: item.format || 'TV',
    releaseYear: item.seasonYear || null,
    nextAiringEpisode: item.nextAiringEpisode ? {
      episode: item.nextAiringEpisode.episode,
      timeUntilAiring: Math.max(0, (item.nextAiringEpisode.airingAt || 0) - Math.floor(Date.now() / 1000)),
    } : null,
  }))
}
