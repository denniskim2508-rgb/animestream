import { searchMangaAnilist, fetchMangaById as fetchAnilistManga } from './anilist'
import { lookupManga, getMangaChapters } from './manga'

// ── Anime → Manga ──────────────────────────────────────────────

export async function findMangaForAnime(anilistRelations, animeTitle) {
  if (!anilistRelations?.length) return null

  const mangaRel = anilistRelations.find(
    (r) => r.type === 'ADAPTATION' && r.format === 'MANGA'
  )
  if (!mangaRel) return null

  const anilistMangaId = mangaRel.id
  const candidates = [
    mangaRel.title,
    mangaRel.romajiTitle,
    mangaRel.nativeTitle,
  ].filter(Boolean)

  try {
    let match = await lookupManga(candidates)
    if (!match && animeTitle) {
      match = await lookupManga(animeTitle, { strict: true })
    }
    if (!match) return null

    let latestChapter = null
    try {
      const chRes = await getMangaChapters(match.id, 'en', 1)
      if (chRes.data?.length) {
        latestChapter = chRes.data[0].chapter
      }
    } catch {}

    return {
      mangaId: match.id,
      anilistId: anilistMangaId,
      title: match.title,
      coverImage: match.coverImage,
      author: match.author,
      status: match.status,
      tags: match.tags,
      description: match.description,
      latestChapter,
    }
  } catch {
    return null
  }
}

// ── Manga → Anime ──────────────────────────────────────────────

export async function findAnimeForManga(mangaTitle) {
  if (!mangaTitle) return null

  try {
    const anilistResults = await searchMangaAnilist(mangaTitle, 1, 5)
    const exact = anilistResults.find(
      (m) => (m.title.english || m.title.romaji).toLowerCase() === mangaTitle.toLowerCase()
    )
    const match = exact || anilistResults[0]
    if (!match) return null

    const mangaWithRels = await fetchAnilistManga(match.id)
    const rels = mangaWithRels?.relations?.edges || []
    const animeRel = rels.find((r) => r.node.format === 'TV' || r.node.format === 'MOVIE')
    if (!animeRel) return null

    const node = animeRel.node
    return {
      anilistId: node.id,
      title: node.title.english || node.title.romaji,
      coverImage: node.coverImage?.large,
      episodes: node.episodes,
      status: node.status,
      rating: node.averageScore ? node.averageScore / 10 : null,
      studio: node.studios?.nodes?.[0]?.name || '',
    }
  } catch {
    return null
  }
}
