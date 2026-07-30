const BASE = '/api/manga'

function extractCover(data) {
  const rel = data?.relationships?.find((r) => r.type === 'cover_art')
  if (rel?.attributes?.fileName) {
    return `https://uploads.mangadex.org/covers/${data.id}/${rel.attributes.fileName}.256.jpg`
  }
  return null
}

function extractAuthor(data) {
  const rel = data?.relationships?.find((r) => r.type === 'author')
  return rel?.attributes?.name || 'Unknown'
}

function extractArtist(data) {
  const rel = data?.relationships?.find((r) => r.type === 'artist')
  return rel?.attributes?.name || null
}

function mapManga(manga) {
  const attr = manga.attributes || {}
  const title = attr.title?.en || Object.values(attr.title || {})[0] || 'Untitled'
  const desc = attr.description?.en || ''
  return {
    id: manga.id,
    title,
    description: desc,
    coverImage: extractCover(manga),
    author: extractAuthor(manga),
    artist: extractArtist(manga),
    status: attr.status || 'unknown',
    year: attr.year || null,
    tags: (attr.tags || []).map((t) => t.attributes?.name?.en || '').filter(Boolean),
    rating: attr.contentRating || 'safe',
    followedCount: attr.followedCount || 0,
    demographic: attr.publicationDemographic || null,
    originalLanguage: attr.originalLanguage || null,
    chapterNumbersResetOnNewVolume: attr.chapterNumbersResetOnNewVolume || false,
  }
}

export async function searchManga(query, limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Search failed')
  const json = await res.json()
  return { data: (json.data || []).map(mapManga), total: json.total || 0 }
}

export async function getTrendingManga(limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/trending?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch trending')
  const json = await res.json()
  return { data: (json.data || []).map(mapManga), total: json.total || 0 }
}

export async function getLatestManga(limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/latest?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch latest')
  const json = await res.json()
  return { data: (json.data || []).map(mapManga), total: json.total || 0 }
}

export async function getRandomManga() {
  const res = await fetch(`${BASE}/random`)
  if (!res.ok) throw new Error('Failed to fetch random manga')
  const json = await res.json()
  return mapManga(json.data)
}

export async function getMangaDetails(id) {
  const res = await fetch(`${BASE}/${id}`)
  if (!res.ok) throw new Error('Failed to fetch manga details')
  const json = await res.json()
  return mapManga(json.data)
}

export async function getMangaChapters(id, lang = 'en', limit = 100, offset = 0) {
  const res = await fetch(`${BASE}/${id}/chapters?lang=${lang}&limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch chapters')
  const json = await res.json()
  const chapters = (json.data || []).map((ch) => {
    const attr = ch.attributes || {}
    return {
      id: ch.id,
      chapter: attr.chapter ? parseFloat(attr.chapter) : null,
      title: attr.title || '',
      volume: attr.volume ? parseFloat(attr.volume) : null,
      lang: attr.translatedLanguage || 'en',
      pages: attr.pages || 0,
      publishedAt: attr.publishAt || null,
      group: (ch.relationships || []).find((r) => r.type === 'scanlation_group')?.attributes?.name || null,
    }
  }).filter((ch) => ch.chapter !== null)
  return { data: chapters, total: json.total || 0 }
}

export async function getChapterPages(chapterId) {
  const res = await fetch(`${BASE}/chapter/${chapterId}`)
  if (!res.ok) throw new Error('Failed to fetch chapter pages')
  const json = await res.json()
  const baseUrl = json.baseUrl || 'https://uploads.mangadex.org'
  const chapter = json.chapter || {}
  const hash = chapter.hash
  const pages = (chapter.data || []).map((filename) => `${baseUrl}/data/${hash}/${filename}`)
  const pagesSd = (chapter.dataSaver || []).map((filename) => `${baseUrl}/data-saver/${hash}/${filename}`)
  return { pages, pagesSd, hash, baseUrl }
}
