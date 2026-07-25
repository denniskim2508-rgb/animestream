export async function resolveStream(animeTitle, episode, audioMode = 'sub') {
  const params = new URLSearchParams({
    title: animeTitle,
    episode: String(episode),
    audio: audioMode,
  })

  const res = await fetch(`/api/stream/resolve?${params}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Stream resolution failed (${res.status})`)
  }
  const data = await res.json()
  data.proxyUrl = `/api/stream/proxy?url=${encodeURIComponent(data.streamUrl)}`
  return data
}

export async function searchAnimeSource(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) return null
  return res.json()
}

export async function getAnimeEpisodes(slug) {
  const res = await fetch(`/api/episodes?slug=${encodeURIComponent(slug)}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.episodes || []
}
