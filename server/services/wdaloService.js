// Evidence source for the AI adaptation resolver: "Where Does The Anime Leave
// Off?" (wheredoestheanimeleaveoff.com) is a WordPress blog with one post per
// anime that states, in prose, where the anime stopped ("...you can start at
// Volume 24, Chapter 308."). That line is exactly the kind of explicit
// statement the resolver's verbatim-quote verification needs.
//
// The site exposes no JSON API, so we guess the post URL from the title slug
// (where-does-the-<title>-anime-end-in-the-<format>/) and fall back to the
// site's ?s= search, then strip the article HTML into plain text.

import { fetchWithTimeout } from '../utils/http.js'
import { normalizeTitle } from './annService.js'

const WDALO_BASE = 'https://wheredoestheanimeleaveoff.com'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const FORMAT_SUFFIX = {
  MANGA: 'manga',
  LIGHT_NOVEL: 'light-novel',
  NOVEL: 'novel',
  MANHUA: 'manhua',
  MANHWA: 'manhwa',
  ONE_SHOT: 'manga',
}

function truncate(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function slugify(title) {
  return normalizeTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatSuffix(format) {
  return FORMAT_SUFFIX[format] || 'manga'
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#821[67];/g, "'")
    .replace(/&#822[01];/g, '"')
    .replace(/&#821[12];/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}

// Isolate the article body and page title from a rendered WordPress page.
function parsePost(html) {
  const titleMatch = String(html || '').match(/<title>([^<]*)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].replace(/[|–-].*$/, '').trim() : ''
  const articleMatch = String(html || '').match(/<article[\s\S]*?<\/article>/i)
  const article = htmlToText(articleMatch ? articleMatch[0] : html)
  return { pageTitle, article }
}

async function fetchPost(url) {
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': BROWSER_UA } },
    { provider: 'wdalo', label: `resolver:wdalo:post:${url}`, timeoutMs: 8000, retries: 0 }
  )
  const post = parsePost(await res.text())
  // A real post answers "where to start"; 404/search pages don't.
  if (!post.article.includes('Where To Start')) return null
  return post
}

// Guess the post URL from the title slug (fast path for covered titles).
async function guessPost(title, suffix) {
  const slugs = [slugify(title)]
  // The site often drops the subtitle from the slug (AniList "Frieren: Beyond
  // Journey's End" -> "where-does-the-frieren-...").
  const beforeColon = title.split(/[:：]/)[0].trim()
  if (beforeColon && slugify(beforeColon) !== slugs[0]) slugs.push(slugify(beforeColon))
  for (const slug of slugs) {
    const url = `${WDALO_BASE}/where-does-the-${slug}-anime-end-in-the-${suffix}/`
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': BROWSER_UA } },
      // allowNonOk: a 404 here just means "not covered", not that the site is
      // down — don't let a legit miss trip the circuit breaker.
      { provider: 'wdalo', label: `resolver:wdalo:guess:${url}`, timeoutMs: 8000, retries: 0, allowNonOk: true }
    )
    const post = parsePost(await res.text())
    if (post.article.includes('Where To Start')) return { post, url }
  }
  return null
}

// Extract a /where-does-the-.../ post path from an (un)quoted href value.
function postPathFromHref(url) {
  const m = /(?:https?:\/\/[^\s"'/]*?wheredoestheanimeleaveoff\.com)?\/(where-does-the-[^\s"'?&#]*)/i.exec(url || '')
  return m ? m[1].replace(/\/+$/, '') : null
}

// WordPress search is strict about every term appearing, and the post title is
// often just the main title — so retry with the subtitle stripped, then with
// just the first two significant words.
function searchQueries(title) {
  const queries = [title]
  const beforeColon = title.split(/[:：]/)[0].trim()
  if (beforeColon && beforeColon !== title) queries.push(beforeColon)
  const words = title.split(/\s+/).filter((w) => w.length > 2)
  if (words.length >= 2) queries.push(words.slice(0, 2).join(' '))
  return queries
}

// Fall back to the WordPress search for titles whose slug differs from ours.
async function searchPost(title, suffix) {
  const candidates = new Map() // path -> format suffix matched?
  for (const q of searchQueries(title)) {
    const res = await fetchWithTimeout(
      `${WDALO_BASE}/?s=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': BROWSER_UA } },
      { provider: 'wdalo', label: `resolver:wdalo:search:${q}`, timeoutMs: 8000, retries: 0 }
    )
    const html = await res.text()
    // The site's markup writes many attributes unquoted (href=...), so accept
    // both quoted and bare values.
    for (const m of String(html).matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/gi)) {
      const path = postPathFromHref(m[1] || m[2] || m[3])
      if (path && path.includes('anime-end-in-the-') && !candidates.has(path)) {
        candidates.set(path, path.includes(suffix))
      }
    }
    if (!candidates.size) continue
    // Prefer a post whose format matches the source material, then any post.
    const ordered = [...candidates.entries()].sort((a, b) => Number(b[1]) - Number(a[1]))
    for (const [path] of ordered) {
      const post = await fetchPost(`${WDALO_BASE}/${path}`)
      if (post) return { post, url: `${WDALO_BASE}/${path}` }
    }
    return null
  }
  return null
}

export async function wdaloEvidence(title, format) {
  try {
    const suffix = formatSuffix(format)
    const found = (await guessPost(title, suffix)) || (await searchPost(title, suffix))
    if (!found) return null
    const label = found.post.pageTitle || title
    return {
      name: 'wheredoestheanimeleaveoff',
      url: found.url,
      text: truncate(`Where Does The Anime Leave Off post "${label}": ${found.post.article}`, 5500),
    }
  } catch (err) {
    console.log(`[resolver] wdalo evidence unavailable: ${err.message}`)
    return null
  }
}
