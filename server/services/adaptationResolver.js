// AI resolver for the anime→manga continuation (step 3 of the resolve flow:
// static map → persistent store → AI resolver → save).
//
// Called only when the static map and the persistent store both miss. It
// gathers text evidence from several sources, asks an LLM to identify the next
// chapter to read using verbatim quotes, deterministically verifies the answer
// (the quoted text must literally appear in the source and the chapter math
// must be consistent), and saves the result only when confidence is high.
// When sources disagree or no source is explicit, it refuses to save rather
// than guessing.
//
// Evidence sources, by weight:
//   - AniList  (anime + source manga metadata: chapters, status, relations)
//   - ANN      (episode count, adapted-from manga — relationship validation)
//   - Fandom   (per-episode chapter coverage, when a wiki is discoverable)
//   - Wikipedia("List of ... episodes" — supporting text)
//   - Reddit   (community consensus — supporting evidence only, never the
//               deciding factor)

import { fetchWithTimeout } from '../utils/http.js'
import { searchByName, normalizeTitle } from './annService.js'

const ANILIST_API = 'https://graphql.anilist.co'
const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

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

export function resolverEnabled() {
  return Boolean(process.env.OPENAI_API_KEY)
}

// ── AniList ────────────────────────────────────────────────────
async function anilistFetch(query, variables, label) {
  const res = await fetchWithTimeout(
    ANILIST_API,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
    { provider: 'anilist', label, timeoutMs: 8000 }
  )
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const ANIME_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      title { romaji english }
      episodes
      status
      format
      relations { edges { relationType node { id type format title { romaji english } } } }
    }
  }`

const MANGA_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      title { romaji english }
      chapters
      volumes
      status
    }
  }`

export async function anilistAnime(anilistId) {
  const data = await anilistFetch(ANIME_QUERY, { id: Number(anilistId) }, `resolver:anime:${anilistId}`)
  return data?.Media || null
}

export async function anilistManga(mangaId) {
  const data = await anilistFetch(MANGA_QUERY, { id: Number(mangaId) }, `resolver:manga:${mangaId}`)
  return data?.Media || null
}

function titleOf(media) {
  return media?.title?.english || media?.title?.romaji || null
}

// Source manga of an AniList anime via the ADAPTATION relation.
export function sourceManga(anime) {
  for (const edge of anime?.relations?.edges || []) {
    if (edge.relationType === 'ADAPTATION' && edge.node?.type === 'MANGA') {
      return { anilistId: edge.node.id, title: titleOf(edge.node), format: edge.node.format }
    }
  }
  return null
}

// ── Source fetchers (each best-effort, failure tolerated) ─────
export async function annEvidence(title) {
  try {
    const parsed = await searchByName(normalizeTitle(title))
    const matches = parsed.anime.filter((a) => normalizeTitle(a.name) === normalizeTitle(title))
    // Prefer the record that states its source ("adapted from"); fall back to
    // the plain TV record so seasons don't shadow the base adaptation.
    const anime = matches.find((a) => a.relations.some((r) => r.rel === 'adapted from')) || matches[0]
    if (!anime) return null
    const source = parsed.manga.find((m) => anime.relations.some((r) => r.rel === 'adapted from' && r.id === m.id))
    return {
      name: 'animenewsnetwork',
      url: `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${anime.id}`,
      text: truncate(
        `Anime "${anime.name}" (precision ${anime.precision}, ${anime.numEpisodes ?? '?'} episodes). ` +
          `Adapted from manga ${source ? `"${source.title}" (ANN id ${source.id})` : 'unknown'}.`,
        800
      ),
    }
  } catch (err) {
    console.log(`[resolver] ANN evidence unavailable: ${err.message}`)
    return null
  }
}

export async function fandomEvidence(title, episode) {
  const slugs = [slugify(title), `${slugify(title)}-anime`]
  for (const slug of slugs) {
    try {
      const base = `https://${slug}.fandom.com/api.php`
      const site = await fetchWithTimeout(
        `${base}?action=query&meta=siteinfo&format=json`,
        { headers: { 'User-Agent': BROWSER_UA } },
        { provider: 'fandom', label: `resolver:site:${slug}`, timeoutMs: 8000, retries: 0 }
      )
      await site.json()
      const search = await fetchWithTimeout(
        `${base}?action=query&list=search&srsearch=${encodeURIComponent(`Episode ${episode} chapter`)}&srlimit=3&format=json&formatversion=2`,
        { headers: { 'User-Agent': BROWSER_UA } },
        { provider: 'fandom', label: `resolver:search:${slug}:${episode}`, timeoutMs: 8000, retries: 0 }
      )
      const sj = await search.json()
      const hits = (sj.query?.search || []).slice(0, 2)
      const texts = []
      for (const hit of hits) {
        const page = await fetchWithTimeout(
          `${base}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(hit.title)}`,
          { headers: { 'User-Agent': BROWSER_UA } },
          { provider: 'fandom', label: `resolver:page:${slug}`, timeoutMs: 8000, retries: 0 }
        )
        const pj = await page.json()
        const content = pj.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content
        if (typeof content === 'string') texts.push(`Page "${hit.title}": ${truncate(content, 2500)}`)
      }
      if (!texts.length) return null
      return { name: `fandom (${slug})`, url: `https://${slug}.fandom.com`, text: truncate(texts.join('\n'), 5500) }
    } catch (err) {
      console.log(`[resolver] fandom ${slug} unavailable: ${err.message}`)
    }
  }
  return null
}

export async function wikipediaEvidence(title) {
  try {
    const search = await fetchWithTimeout(
      `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(`${title} list of episodes`)}&srlimit=1&format=json&formatversion=2`,
      { headers: { 'User-Agent': BROWSER_UA } },
      { provider: 'wikipedia', label: `resolver:wiki:${title}`, timeoutMs: 8000, retries: 0 }
    )
    const sj = await search.json()
    const pageTitle = sj.query?.search?.[0]?.title
    if (!pageTitle) return null
    const page = await fetchWithTimeout(
      `${WIKI_API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json&formatversion=2`,
      { headers: { 'User-Agent': BROWSER_UA } },
      { provider: 'wikipedia', label: 'resolver:wikitext', timeoutMs: 8000, retries: 0 }
    )
    const pj = await page.json()
    const wikitext = pj.parse?.wikitext
    if (typeof wikitext !== 'string') return null
    return {
      name: 'wikipedia',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
      text: truncate(`Page "${pageTitle}": ${wikitext}`, 5500),
    }
  } catch (err) {
    console.log(`[resolver] wikipedia evidence unavailable: ${err.message}`)
    return null
  }
}

export async function redditEvidence(title, episode) {
  const q = encodeURIComponent(`"${title}" episode ${episode} manga chapter`)
  for (const host of ['www.reddit.com', 'old.reddit.com']) {
    try {
      const res = await fetchWithTimeout(
        `https://${host}/search.json?q=${q}&limit=3`,
        { headers: { 'User-Agent': BROWSER_UA } },
        { provider: 'reddit', label: `resolver:reddit:${episode}`, timeoutMs: 8000, retries: 0 }
      )
      const j = await res.json()
      const posts = (j.data?.children || []).map((c) => c.data).filter(Boolean)
      if (!posts.length) return null
      const items = posts.map((p) =>
        `${p.subreddit} | ${p.title} | ${truncate(p.selftext || '', 500)}`
      )
      return { name: 'reddit', url: 'https://www.reddit.com/search', text: truncate(items.join('\n'), 3000) }
    } catch (err) {
      console.log(`[resolver] reddit ${host} unavailable: ${err.message}`)
    }
  }
  return null
}

// ── LLM stage ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You map anime episodes to manga chapters for a "continue reading" feature.
Given an anime, its source manga, and text evidence gathered from several websites, answer: after watching episode <N>, which manga chapter should the reader continue from?

Hard rules:
- Answer ONLY from explicit statements in the provided evidence. Never guess, estimate, or use outside knowledge of chapter numbers.
- The continuation chapter is (the last chapter the episode adapted) + 1, unless a source states the next chapter explicitly.
- Every item in evidenceQuotes must be a verbatim quote copied from the provided source text, and it must appear word-for-word in that source. No paraphrasing.
- If NO source explicitly states which chapters the episode (or the anime's coverage) adapts, return nextChapter null and confidence "low".
- If the anime has fully adapted the manga (no chapters remain), set nextChapter null and mangaFullyAdapted true.
- If sources contradict each other, set conflict true and confidence at most "medium".
- Fandom wikis are the strongest evidence; community posts (reddit) are supporting evidence only and alone are not enough for "high".
Respond with JSON only: {"nextChapter": int|null, "lastAdaptedChapter": int|null, "isFiller": bool, "mangaFullyAdapted": bool, "conflict": bool, "confidence": "high"|"medium"|"low", "evidenceQuotes": [{"source": string, "url": string|null, "quote": string}], "reasoning": string}`

async function askLlm(bundle) {
  const res = await fetchWithTimeout(
    OPENAI_API,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(bundle) },
        ],
      }),
    },
    { provider: 'openai', label: `resolver:llm:${bundle.anime.anilistId}`, timeoutMs: 30000, retries: 0 }
  )
  const j = await res.json()
  const content = j.choices?.[0]?.message?.content
  if (!content) throw new Error(j.error?.message || 'empty LLM response')
  return JSON.parse(content.trim())
}

// ── Deterministic verification (anti-hallucination gate) ──────
function normalize(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// A quote is verified if it appears verbatim (whitespace-normalized) in the
// source it claims to come from.
export function verifyQuotes(quotes, sources) {
  const verified = []
  for (const q of quotes || []) {
    const src = sources.find((s) => s.name === q.source)
    if (src && normalize(src.text).includes(normalize(q.quote))) verified.push(q)
  }
  return verified
}

// The answer must be supported by at least one verified quote: the quote must
// either name nextChapter directly, or name a chapter K where K+1 === nextChapter.
export function quoteSupports(quotes, nextChapter) {
  if (nextChapter == null) return quotes.length > 0
  return quotes.some((q) => {
    const nums = (q.quote.match(/\d+/g) || []).map(Number)
    return nums.includes(nextChapter) || nums.includes(nextChapter - 1)
  })
}

export function assessConfidence(parsed, quotes, manga) {
  let confidence = parsed.confidence

  if (!quotes.length) return 'low'
  if (parsed.conflict) confidence = confidence === 'high' ? 'medium' : confidence
  if (parsed.nextChapter != null && !quoteSupports(quotes, parsed.nextChapter)) confidence = 'low'
  if (parsed.nextChapter == null && !parsed.mangaFullyAdapted && !parsed.isFiller) confidence = 'low'
  if (manga?.chapters && parsed.nextChapter != null && parsed.nextChapter > manga.chapters) {
    confidence = confidence === 'high' ? 'medium' : confidence
  }
  return confidence
}

// ── Main resolver ──────────────────────────────────────────────
export async function resolveAdaptation(anilistId, episode) {
  const anime = await anilistAnime(anilistId).catch((err) => {
    console.error(`[resolver] AniList anime lookup failed: ${err.message}`)
    return null
  })
  if (!anime) return { ok: false, message: "Couldn't fetch anime metadata." }

  const title = titleOf(anime)
  const mangaRel = sourceManga(anime)
  const manga = mangaRel ? await anilistManga(mangaRel.anilistId).catch(() => null) : null

  const sources = []
  const fetchResults = await Promise.allSettled([
    annEvidence(title),
    fandomEvidence(title, episode),
    wikipediaEvidence(title),
    redditEvidence(title, episode),
  ])
  for (const r of fetchResults) if (r.status === 'fulfilled' && r.value) sources.push(r.value)

  const bundle = {
    anime: {
      anilistId: Number(anilistId),
      title,
      episodes: anime.episodes ?? null,
      status: anime.status ?? null,
      format: anime.format ?? null,
    },
    episode: Number(episode),
    manga: manga
      ? { title: titleOf(manga), anilistId: mangaRel.anilistId, chapters: manga.chapters ?? null, status: manga.status ?? null }
      : null,
    sources,
  }

  if (!sources.length) {
    return { ok: false, message: "Couldn't gather evidence from any source." }
  }

  let parsed
  try {
    parsed = await askLlm(bundle)
  } catch (err) {
    console.error(`[resolver] LLM failed: ${err.message}`)
    return { ok: false, message: `AI resolver error: ${err.message}` }
  }

  const verified = verifyQuotes(parsed.evidenceQuotes, sources)
  const confidence = assessConfidence(parsed, verified, manga)

  console.log(
    `[resolver] animeId=${anilistId} ep=${episode} "${title}" -> next=${parsed.nextChapter ?? '-'} confidence=${confidence} quotes=${verified.length}/${(parsed.evidenceQuotes || []).length} conflict=${parsed.conflict}`
  )

  if (confidence !== 'high') {
    return {
      ok: false,
      confidence,
      message: "I couldn't determine the continuation chapter with high confidence.",
      evidence: verified,
      parsed,
    }
  }

  return {
    ok: true,
    confidence,
    result: {
      animeId: Number(anilistId),
      episode: Number(episode),
      animeTitle: title,
      series: null,
      lastAdaptedChapter: parsed.lastAdaptedChapter ?? null,
      nextChapter: parsed.nextChapter ?? null,
      filler: Boolean(parsed.isFiller),
      previousCanonEpisode: null,
      mangaFullyAdapted: Boolean(parsed.mangaFullyAdapted),
      source: 'ai',
      evidence: verified,
    },
    parsed,
  }
}
