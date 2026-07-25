const JIKAN = 'https://api.jikan.moe/v4'

async function jikanFetch(url) {
  const res = await fetch(url)
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500))
    return jikanFetch(url)
  }
  if (!res.ok) throw new Error(`Jikan API error: ${res.status}`)
  return res.json()
}

function normalize(anime) {
  return {
    id: anime.mal_id,
    title: anime.title_english || anime.title,
    romajiTitle: anime.title,
    coverImage: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
    bannerImage: anime.images?.jpg?.large_image_url || '',
    rating: anime.score || null,
    episodes: anime.episodes || null,
    genres: (anime.genres || []).map((g) => g.name.toLowerCase().replace(/ /g, '')),
    genresRaw: (anime.genres || []).map((g) => g.name),
    status: anime.status === 'Currently Airing' ? 'RELEASING'
      : anime.status === 'Finished Airing' ? 'FINISHED'
      : anime.status === 'Not yet aired' ? 'NOT_YET_RELEASED'
      : anime.status,
    format: anime.type || 'TV',
    releaseYear: anime.year || anime.aired?.prop?.from?.year || null,
    description: (anime.synopsis || '').replace(/\[Written by MAL Rewrite\]/g, '').trim(),
    trailer: anime.trailer?.youtube_id
      ? { id: anime.trailer.youtube_id, thumbnail: anime.trailer.images?.maximum_image_url || '' }
      : null,
  }
}

export async function fetchTopAiring(limit = 10) {
  try {
    const { data } = await jikanFetch(`${JIKAN}/top/anime?filter=airing&limit=${limit}`)
    return (data || []).map(normalize)
  } catch {
    return []
  }
}

export async function fetchTopUpcoming(limit = 10) {
  try {
    const { data } = await jikanFetch(`${JIKAN}/top/anime?filter=upcoming&limit=${limit}`)
    return (data || []).map(normalize)
  } catch {
    return []
  }
}
