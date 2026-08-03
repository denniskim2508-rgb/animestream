// ── Common provider interface ─────────────────────────────────
// Every reader provider (MangaDex, AsuraScans, MangaPill, AllManga, Kitsu)
// implements the same contract, so the Provider Manager can route and fall
// back between them without any provider-specific code:
//
//   search(query, limit, offset)        -> { data: Manga[], total }
//   detail(ref)                         -> { data: Manga }
//   chapters(ref, lang, limit, offset)  -> { data: Chapter[], total }
//   pages(ref)                          -> { pages, pagesSd, hash, baseUrl }
//   trending(limit, offset)             -> { data, total }
//   latest(limit, offset)               -> { data, total }
//   random()                            -> { data: Manga }
//   lookup(candidates, strict)          -> Manga | null
//
// Manga:   { id, title, description, coverImage, author, artist, status, year,
//            tags, rating, followedCount, demographic, originalLanguage,
//            chapterNumbersResetOnNewVolume, provider, chaptersTotal, altTitles }
// Chapter: { id, chapter, title, volume, lang, pages, publishedAt, group }
//
// `ref` is the provider-local portion of an opaque id
// ("mangadex:<uuid>", "asurascans:<slug>:<chapterSlug>", ...). Opaque ids are
// owned by the manager, never by the provider.

export const PROVIDER_METHODS = ['search', 'detail', 'chapters', 'pages', 'trending', 'latest', 'random', 'lookup']

// Wrap a raw provider module into the full interface, supplying safe defaults
// for any missing method so the manager can always call it uniformly. Kitsu,
// for example, is metadata-only: its pages() throws, and the manager treats
// that as a signal to fall back to a readable provider.
export function normalizeProvider(name, impl) {
  const empty = async () => ({ data: [], total: 0 })
  const provider = {
    name,
    ...impl,
    search: impl.search || empty,
    chapters: impl.chapters || empty,
    pages: impl.pages || (async () => { throw new Error(`${name}: does not host chapter pages`) }),
    detail: impl.detail || (async () => { throw new Error(`${name}: detail not implemented`) }),
    trending: impl.trending || impl.search || empty,
    latest: impl.latest || impl.search || empty,
    random: impl.random || impl.search || empty,
    lookup: impl.lookup || (async () => null),
  }
  for (const method of PROVIDER_METHODS) {
    if (typeof provider[method] !== 'function') {
      throw new Error(`${name}: provider does not implement interface method "${method}"`)
    }
  }
  return provider
}

// A usable page set must contain at least one entry pointing at an absolute URL
// or one of our own proxy routes. Proxied providers return `/api/media/proxy?...`
// paths, raw providers return `https://...` CDN links.
export function validPageUrls(urls) {
  if (!Array.isArray(urls) || !urls.length) return false
  return urls.every((u) => {
    const s = String(u || '')
    return /^https?:\/\//i.test(s) || s.startsWith('/api/media/proxy?')
  })
}
