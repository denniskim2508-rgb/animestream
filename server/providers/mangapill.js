import { titleScore, normalizeTitle, isDoujinshiOrColored, encodeHeaders } from './util.js'
import { normalizeProvider } from './interface.js'

const SITE = 'https://mangapill.com'
const PROVIDER = 'mangapill'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: `${SITE}/` },
  })
  if (!res.ok) throw new Error(`Mangapill ${res.status}`)
  return res.text()
}

function clean(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// All assets live on cdn.readdetectiveconan.com, which 403s without a Referer
// from mangapill.com — route covers and page images through the media proxy.
function proxied(url) {
  const headers = encodeHeaders({ Referer: `${SITE}/`, 'User-Agent': UA })
  return `/api/media/proxy?url=${encodeURIComponent(url)}&h=${headers}`
}

function isNovel(title, slug) {
  return /\bnovel\b/i.test(String(title || '')) || /-novel$/.test(String(slug || ''))
}

function mapManga(item) {
  return {
    id: `${PROVIDER}:${item.id || item.slug}`,
    title: item.title,
    description: item.description || '',
    coverImage: item.coverImage ? proxied(item.coverImage) : null,
    author: item.author || 'Unknown',
    artist: item.artist || null,
    status: item.status || 'unknown',
    year: item.year || null,
    tags: item.genres || [],
    rating: null,
    followedCount: 0,
    demographic: null,
    originalLanguage: null,
    chapterNumbersResetOnNewVolume: false,
    provider: PROVIDER,
  }
}

// List pages render each manga twice (a cover link + a title link). Both share
// the same `/manga/{id}/{slug}` href, so we can gather cover and title from
// whichever block carries them and merge by id.
function parseMangaCards(html) {
  const byId = new Map()
  for (const m of String(html).matchAll(/<a href="\/manga\/(\d+)\/([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const id = m[1]
    const cur = byId.get(id) || { id, slug: m[2], title: '', coverImage: '' }
    const block = m[3]
    const img = block.match(/(?:data-src|src)="([^"]+)"/)
    if (img && !cur.coverImage) cur.coverImage = img[1]
    const title = block.match(/(?:font-black|text-sm font-bold)[^>]*>([\s\S]*?)</)
    if (title && !cur.title) cur.title = clean(title[1])
    byId.set(id, cur)
  }
  return [...byId.values()].filter((i) => i.title && i.coverImage)
}

function field(html, label) {
  const m = html.match(
    new RegExp(`<label class="text-secondary">${label}<\\/label>[\\s\\S]{0,100}?<div>([\\s\\S]*?)<\\/div>`),
  )
  return m ? clean(m[1]) : null
}

function parseDetail(html, ref) {
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  if (!titleM) throw new Error('Mangapill: series not found')
  const descM = html.match(/<p class="text-sm text--secondary">([\s\S]*?)<\/p>/)
  const coverM =
    html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/) ||
    html.match(/<img[^>]*data-src="([^"]*\/i\/[^"]+)"/)
  const statusRaw = field(html, 'Status') || 'unknown'
  const statusMap = {
    publishing: 'ongoing',
    finished: 'completed',
    on_hiatus: 'hiatus',
    cancelled: 'cancelled',
  }
  const yearRaw = Number(field(html, 'Year'))
  const genres = [...html.matchAll(/href="\/search\?genre=[^"]*">([^<]*)<\/a>/g)]
    .map((x) => clean(x[1]))
    .filter(Boolean)
  return mapManga({
    id: ref,
    title: clean(titleM[1]),
    description: clean(descM?.[1] || ''),
    coverImage: coverM?.[1] || null,
    author: field(html, 'Authors') || 'Unknown',
    status: statusMap[statusRaw.toLowerCase()] || statusRaw.toLowerCase(),
    year: Number.isNaN(yearRaw) ? null : yearRaw,
    genres,
  })
}

export async function search(query, limit = 20, offset = 0) {
  const html = await fetchHtml(`${SITE}/search?q=${encodeURIComponent(query)}`)
  const items = parseMangaCards(html)
    .filter((m) => !isDoujinshiOrColored(m.title) && !isNovel(m.title, m.slug))
    .map(mapManga)
  return { data: items.slice(offset, offset + limit), total: items.length }
}

export async function trending(limit = 20, offset = 0) {
  const html = await fetchHtml(`${SITE}/`)
  const ti = html.indexOf('Trending Mangas</h4>')
  const items =
    ti > -1
      ? parseMangaCards(html.slice(ti, ti + 9000))
          .filter((m) => !isNovel(m.title, m.slug))
          .map(mapManga)
      : []
  return { data: items.slice(offset, offset + limit), total: items.length }
}

export async function latest(limit = 20, offset = 0) {
  const html = await fetchHtml(`${SITE}/chapters`)
  const items = parseMangaCards(html)
    .filter((m) => !isNovel(m.title, m.slug))
    .map(mapManga)
  return { data: items.slice(offset, offset + limit), total: items.length }
}

export async function lookup(candidates, strict = false) {
  let best = null
  let bestScore = 0
  const seen = new Set()
  for (const query of candidates) {
    const norm = normalizeTitle(query)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    try {
      const html = await fetchHtml(`${SITE}/search?q=${encodeURIComponent(query)}`)
      for (const item of parseMangaCards(html)) {
        if (isDoujinshiOrColored(item.title) || isNovel(item.title, item.slug)) continue
        const score = Math.max(0, titleScore(query, item.title))
        if (score === 100) {
          bestScore = 110
          best = item
          break
        }
        if (!strict && score > bestScore) {
          bestScore = score
          best = item
        }
      }
    } catch {
      /* keep searching other candidates */
    }
    if (bestScore >= 110) break
  }
  return bestScore >= (strict ? 110 : 90) ? mapManga(best) : null
}

export async function detail(ref) {
  const html = await fetchHtml(`${SITE}/manga/${ref}`)
  return { data: parseDetail(html, ref) }
}

export async function chapters(ref, _lang = 'en', limit = 100, offset = 0) {
  const html = await fetchHtml(`${SITE}/manga/${ref}`)
  const out = []
  const seen = new Set()
  for (const m of html.matchAll(/href="\/chapters\/(\d+-\d+)\/([^"/]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const idPart = m[1]
    if (seen.has(idPart)) continue
    seen.add(idPart)
    const text = clean(m[3])
    // The anchor text is prefixed with a group label (e.g. "Group 2 Chapter
    // 386"), so the first number is wrong — read the number from the slug.
    const numMatch = m[2].match(/chapter-(\d+(?:\.\d+)?)/i) || text.match(/(\d+)\s*$/)
    out.push({
      id: `${PROVIDER}:${ref}:${idPart}/${m[2]}`,
      chapter: numMatch ? parseFloat(numMatch[1]) : null,
      title: text,
      volume: null,
      lang: 'en',
      pages: 0,
      publishedAt: null,
      group: null,
    })
  }
  const end = limit >= 500 ? out.length : Math.min(offset + limit, out.length)
  return { data: out.slice(offset, end), total: out.length }
}

export async function pages(ref) {
  // chapter id stores the full route segment after the provider prefix,
  // e.g. `mangapill:6372:6372-10148000/solo-glitch-player-chapter-148`.
  const i = String(ref || '').indexOf(':')
  const rest = i === -1 ? String(ref || '') : String(ref).slice(i + 1)
  if (!rest) throw new Error('Mangapill: malformed chapter id')
  const html = await fetchHtml(`${SITE}/chapters/${rest}`)
  const urls = []
  for (const m of html.matchAll(/<img[^>]*(?:src|data-src)="([^"]+)"[^>]*>/g)) {
    const u = m[1]
    if (u.includes('readdetectiveconan.com')) urls.push(proxied(u))
  }
  return { pages: urls, pagesSd: urls, hash: null, baseUrl: null }
}

export async function random() {
  const res = await fetch(`${SITE}/mangas/random`, {
    headers: { 'User-Agent': UA, Referer: `${SITE}/` },
    redirect: 'follow',
  })
  const html = await res.text()
  const m = res.url.match(/\/manga\/(\d+)\//)
  if (!m) return { data: null }
  try {
    return { data: parseDetail(html, m[1]) }
  } catch {
    return { data: null }
  }
}

export const provider = normalizeProvider('mangapill', { search, detail, chapters, pages, trending, latest, random, lookup })
