import { normalizeTitle, titleScore, isDoujinshiOrColored } from './util.js'

const API = 'https://api.mangadex.org'
const COVERS = 'https://uploads.mangadex.org/covers'
const PROVIDER = 'mangadex'

export async function mangadexFetch(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
  if (!res.ok) throw new Error(`MangaDex API ${res.status}: ${res.statusText}`)
  return res.json()
}

function allTitleStrings(manga) {
  const attr = manga.attributes || {}
  const titles = Object.values(attr.title || {})
  for (const alt of attr.altTitles || []) {
    titles.push(...Object.values(alt))
  }
  return titles.filter(Boolean)
}

function shouldExclude(manga) {
  return isDoujinshiOrColored(...allTitleStrings(manga))
}

function extractTitle(manga) {
  const attr = manga.attributes || {}
  const title = attr.title || {}
  if (title.en) return title.en
  const altEn = (attr.altTitles || []).find((t) => t.en)?.en
  if (altEn) return altEn
  return Object.values(title)[0] || 'Untitled'
}

function mapManga(manga) {
  const attr = manga.attributes || {}
  const cover = (manga.relationships || []).find((r) => r.type === 'cover_art')
  const author = (manga.relationships || []).find((r) => r.type === 'author')
  const artist = (manga.relationships || []).find((r) => r.type === 'artist')
  return {
    id: `${PROVIDER}:${manga.id}`,
    title: extractTitle(manga),
    altTitles: [...new Set(allTitleStrings(manga))].slice(0, 30),
    description: attr.description?.en || '',
    coverImage: cover?.attributes?.fileName
      ? `${COVERS}/${manga.id}/${cover.attributes.fileName}.256.jpg`
      : null,
    author: author?.attributes?.name || 'Unknown',
    artist: artist?.attributes?.name || null,
    status: attr.status || 'unknown',
    year: attr.year || null,
    tags: (attr.tags || []).map((t) => t.attributes?.name?.en || '').filter(Boolean),
    rating: attr.contentRating || 'safe',
    followedCount: attr.followedCount || 0,
    demographic: attr.publicationDemographic || null,
    originalLanguage: attr.originalLanguage || null,
    chapterNumbersResetOnNewVolume: attr.chapterNumbersResetOnNewVolume || false,
    provider: PROVIDER,
  }
}

function mapChapters(data) {
  const total = data.total || data.data?.length || 0
  // Chapters that only link out to another site have no pages on MangaDex and
  // would render a blank reader, so drop them from the readable list.
  const chapters = (data.data || [])
    .filter((ch) => !ch.attributes?.externalUrl)
    .map((ch) => {
      const attr = ch.attributes || {}
      return {
      id: `${PROVIDER}:${ch.id}`,
      chapter: attr.chapter ? parseFloat(attr.chapter) : null,
      title: attr.title || '',
      volume: attr.volume ? parseFloat(attr.volume) : null,
      lang: attr.translatedLanguage || 'en',
      pages: attr.pages || 0,
      publishedAt: attr.publishAt || null,
      group: (ch.relationships || []).find((r) => r.type === 'scanlation_group')?.attributes?.name || null,
    }
    })
    .filter((ch) => ch.chapter !== null)
  return { data: chapters, total }
}

const SEARCH_PARAMS = 'includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica'

export async function search(query, limit = 20, offset = 0) {
  const data = await mangadexFetch(
    `${API}/manga?title=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&${SEARCH_PARAMS}&order[relevance]=desc`
  )
  const filtered = (data.data || []).filter((m) => !shouldExclude(m))
  return { data: filtered.map(mapManga), total: data.total || filtered.length }
}

export async function trending(limit = 20, offset = 0) {
  const data = await mangadexFetch(
    `${API}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&order[followedCount]=desc&availableTranslatedLanguage[]=en&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`
  )
  return { data: (data.data || []).map(mapManga), total: data.total || 0 }
}

export async function latest(limit = 20, offset = 0) {
  const data = await mangadexFetch(
    `${API}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&order[latestUploadedChapter]=desc&availableTranslatedLanguage[]=en&contentRating[]=safe&contentRating[]=suggestive`
  )
  return { data: (data.data || []).map(mapManga), total: data.total || 0 }
}

export async function random() {
  for (let i = 0; i < 3; i++) {
    const data = await mangadexFetch(`${API}/manga/random?includes[]=cover_art&includes[]=author`)
    if (!shouldExclude(data.data)) return { data: mapManga(data.data) }
  }
  throw new Error('MangaDex random only returned excluded entries')
}

export async function lookup(candidates, strict = false) {
  let best = null
  let bestScore = 0
  const seen = new Set()

  for (const query of candidates) {
    const norm = normalizeTitle(query)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)

    let data
    try {
      data = await mangadexFetch(
        `${API}/manga?title=${encodeURIComponent(query)}&limit=50&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&order[relevance]=desc`
      )
    } catch {
      continue
    }

    for (const manga of data.data || []) {
      if (shouldExclude(manga)) continue
      const attr = manga.attributes || {}
      const primaryScore = Math.max(
        0,
        ...Object.values(attr.title || {}).map((t) => titleScore(query, t))
      )
      const altScore = Math.max(
        0,
        ...(attr.altTitles || []).flatMap((o) => Object.values(o)).map((t) => titleScore(query, t))
      )
      let score
      if (primaryScore === 100) {
        score = 110
      } else if (strict) {
        score = 0
      } else {
        score = Math.max(primaryScore, altScore)
      }
      if (score > bestScore) {
        bestScore = score
        best = manga
      }
    }

    if (bestScore >= 110) break
  }

  return bestScore >= (strict ? 110 : 90) ? mapManga(best) : null
}

export async function detail(ref) {
  const data = await mangadexFetch(
    `${API}/manga/${ref}?includes[]=cover_art&includes[]=author&includes[]=artist&includes[]=tag`
  )
  return { data: mapManga(data.data) }
}

export async function chapters(ref, lang = 'en', limit = 100, offset = 0) {
  const data = await mangadexFetch(
    `${API}/manga/${ref}/feed?limit=${limit}&offset=${offset}&translatedLanguage[]=${lang}&order[chapter]=desc&includes[]=scanlation_group`
  )
  return mapChapters(data)
}

export async function pages(ref) {
  const data = await mangadexFetch(`${API}/at-home/server/${ref}`)
  const baseUrl = data.baseUrl || 'https://uploads.mangadex.org'
  const chapter = data.chapter || {}
  const hash = chapter.hash
  const pages = (chapter.data || []).map((f) => `${baseUrl}/data/${hash}/${f}`)
  const pagesSd = (chapter.dataSaver || []).map((f) => `${baseUrl}/data-saver/${hash}/${f}`)
  return { pages, pagesSd, hash, baseUrl }
}
