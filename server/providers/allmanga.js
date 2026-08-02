import { titleScore, normalizeTitle, isDoujinshiOrColored, encodeHeaders } from './util.js'

const API = 'https://api.allanime.day/api'
const SITE = 'https://allmanga.to'
const IMG_HEAD = 'https://aln.youtube-anime.com'
const PROVIDER = 'allmanga'

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0',
  'Referer': `${SITE}/`,
}

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json().catch(() => null)
  if (!json || json.errors) {
    throw new Error(json?.errors?.[0]?.message || `AllManga API ${res.status}`)
  }
  return json.data
}

// Images and covers on aln.youtube-anime.com are Cloudflare-gated and require
// the allmanga.to Referer, so they must go through our media proxy.
function proxied(url) {
  return `/api/media/proxy?url=${encodeURIComponent(url)}&h=${encodeHeaders({ Referer: `${SITE}/`, 'User-Agent': HEADERS['User-Agent'] })}`
}

function coverUrl(relPath) {
  if (!relPath) return null
  if (relPath.startsWith('http')) return proxied(relPath)
  return proxied(`${IMG_HEAD}/${relPath.replace(/^\//, '')}`)
}

function excludeStrings(m) {
  return [m.name, m.englishName, m.nativeName]
}

function mapManga(m) {
  return {
    id: `${PROVIDER}:${m._id}`,
    title: m.name || m.englishName || m.nativeName || 'Untitled',
    description: m.description || '',
    coverImage: coverUrl(m.thumbnail),
    author: (m.authors || []).filter(Boolean).join(', ') || 'Unknown',
    artist: null,
    status: m.status ? String(m.status).toLowerCase() : 'unknown',
    year: null,
    tags: [...new Set([...(m.genres || []), ...(m.tags || [])])],
    rating: m.score || null,
    followedCount: 0,
    demographic: null,
    originalLanguage: null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
    chaptersTotal: m.availableChapters?.sub || 0,
  }
}

async function listManga(search, limit = 20, offset = 0) {
  const data = await gql(
    `query($search: SearchInput, $limit: Int, $offset: Int) {
      mangas(search: $search, limit: $limit, offset: $offset) {
        edges { _id name englishName nativeName thumbnail description score status genres tags availableChapters }
        pageInfo { total }
      }
    }`,
    { search, limit, offset }
  )
  const edges = (data?.mangas?.edges || []).filter((m) => !isDoujinshiOrColored(...excludeStrings(m)))
  return {
    data: edges.map(mapManga),
    total: data?.mangas?.pageInfo?.total || edges.length,
  }
}

export async function search(query, limit = 20, offset = 0) {
  return listManga({ query, isManga: true }, limit, offset)
}

export async function trending(limit = 20, offset = 0) {
  return listManga({ isManga: true, sortBy: 'Popular', sortDirection: 'DSC' }, limit, offset)
}

export async function latest(limit = 20, offset = 0) {
  return listManga({ isManga: true, sortBy: 'Latest_Update', sortDirection: 'DSC' }, limit, offset)
}

export async function random() {
  const res = await listManga({ isManga: true, sortBy: 'Random' }, 1, 0)
  return { data: res.data[0] || null }
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
      data = await gql(
        `query($search: SearchInput, $limit: Int) {
          mangas(search: $search, limit: $limit) {
            edges { _id name englishName nativeName thumbnail description score status genres tags availableChapters }
          }
        }`,
        { search: { query, isManga: true }, limit: 30 }
      )
    } catch {
      continue
    }

    for (const m of data?.mangas?.edges || []) {
      if (isDoujinshiOrColored(...excludeStrings(m))) continue
      const primaryScore = Math.max(
        0,
        ...[m.name, m.englishName, m.nativeName].filter(Boolean).map((t) => titleScore(query, t))
      )
      let score = 0
      if (primaryScore === 100) score = 110
      else if (!strict) score = primaryScore
      if (score > bestScore) {
        bestScore = score
        best = m
      }
    }

    if (bestScore >= 110) break
  }

  return bestScore >= (strict ? 110 : 90) ? mapManga(best) : null
}

export async function detail(ref) {
  const data = await gql(
    `query($id: String!) {
      manga(_id: $id) {
        _id name englishName nativeName thumbnail description score status genres tags authors availableChapters availableChaptersDetail
      }
    }`,
    { id: ref }
  )
  const m = data?.manga
  if (!m) throw new Error('AllManga: manga not found')
  return { data: mapManga(m) }
}

export async function chapters(ref, _lang = 'en', limit = 100, offset = 0) {
  const data = await gql(
    `query($id: String!) { manga(_id: $id) { availableChaptersDetail } }`,
    { id: ref }
  )
  const subs = data?.manga?.availableChaptersDetail?.sub || []
  const all = subs
    .map((ch) => ({
      id: `${PROVIDER}:${ref}:${ch}`,
      chapter: Number.isNaN(parseFloat(ch)) ? null : parseFloat(ch),
      title: '',
      volume: null,
      lang: 'en',
      pages: 0,
      publishedAt: null,
      group: null,
    }))
    .filter((ch) => ch.chapter !== null)
  // The reader requests a large page (limit 500) to enable prev/next across the
  // whole series; return the full list for those so navigation never breaks.
  const end = limit >= 500 ? all.length : Math.min(offset + limit, all.length)
  return { data: all.slice(offset, end), total: all.length }
}

export async function pages(ref) {
  const [mangaId, chapterString] = String(ref || '').split(':')
  if (!mangaId || !chapterString) throw new Error('AllManga: malformed chapter id')

  const data = await gql(
    `query($mangaId: String!, $chapterString: String!, $limit: Int) {
      chaptersForRead(mangaId: $mangaId, translationType: sub, chapterString: $chapterString, limit: $limit) {
        edges { _id chapterString pictureUrlHead pictureUrls }
      }
    }`,
    { mangaId, chapterString, limit: 60 }
  )

  const edges = data?.chaptersForRead?.edges || []
  const edge = edges.find((e) => e.chapterString === chapterString) || edges[0]
  if (!edge) throw new Error('AllManga: chapter not found')

  const urls = (edge.pictureUrls || []).map((u) => proxied(`${IMG_HEAD}/${u.url}`))
  return { pages: urls, pagesSd: urls, hash: null, baseUrl: null }
}
