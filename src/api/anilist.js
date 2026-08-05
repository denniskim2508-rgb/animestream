const ANILIST_API = 'https://graphql.anilist.co'

async function anilistFetch(query, variables = {}) {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000))
      return anilistFetch(query, variables)
    }
    throw new Error(`AniList API error: ${res.status}`)
  }
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const MEDIA_FRAGMENT = `
  id
  title { romaji english native }
  coverImage { large medium color }
  bannerImage
  description(asHtml: false)
  genres
  averageScore
  meanScore
  episodes
  duration
  status
  format
  season
  seasonYear
  trending
  popularity
  favourites
  nextAiringEpisode { episode timeUntilAiring }
  streamingEpisodes { title thumbnail url site }
  trailer { id site thumbnail }
  studios(isMain: true) { nodes { name } }
`

// The homepage rows now come from the backend (/api/anime/home), which runs the
// six AniList queries server-side with a 5-minute cache + single-flight. The
// raw media nodes are normalized here exactly as before, so callers see an
// unchanged shape.
export async function fetchHomepageData(perPage = 10) {
  const res = await fetch(`/api/anime/home?perPage=${perPage}`)
  if (!res.ok) throw new Error(`Anime home fetch failed: ${res.status}`)
  const data = await res.json()
  const rows = ['trending', 'topRated', 'popular', 'recentlyUpdated', 'newReleases', 'upcoming']
  const out = {}
  for (const key of rows) {
    out[key] = (data[key] || []).map(normalizeMedia)
  }
  return out
}

export async function fetchTrendingAnime(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchTopRatedAnime(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchPopularAnime(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchRecentlyUpdated(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: UPDATED_AT_DESC, isAdult: false, status: RELEASING) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchNewReleases(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: START_DATE_DESC, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchMediaById(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FRAGMENT}
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english native }
              coverImage { large medium }
              averageScore
              format
              episodes
            }
          }
        }
        characters(sort: ROLE, perPage: 8) {
          edges {
            role
            node {
              id
              name { full }
              image { medium }
            }
          }
        }
      }
    }
  `
  const data = await anilistFetch(query, { id: Number(id) })
  return normalizeMediaDetail(data.Media)
}

export async function searchAnime(search, page = 1, perPage = 20) {
  const query = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage total }
        media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { search, page, perPage })
  return {
    results: data.Page.media.map(normalizeMedia),
    pageInfo: data.Page.pageInfo,
  }
}

export async function fetchByGenre(genre, page = 1, perPage = 20, sort = 'POPULARITY_DESC') {
  const query = `
    query ($genre: String, $page: Int, $perPage: Int, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage total }
        media(genre: $genre, type: ANIME, isAdult: false, sort: $sort) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { genre, page, perPage, sort })
  return {
    results: data.Page.media.map(normalizeMedia),
    pageInfo: data.Page.pageInfo,
  }
}

export async function fetchBrowse({ page = 1, perPage = 20, genre, sort = 'POPULARITY_DESC', search, status, season, format } = {}) {
  const query = `
    query (
      $page: Int, $perPage: Int, $genre: String, $sort: [MediaSort],
      $search: String, $status: MediaStatus, $season: MediaSeason,
      $seasonYear: Int, $format: [MediaFormat]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage total }
        media(
          type: ANIME, isAdult: false, sort: $sort, genre: $genre,
          search: $search, status: $status, season: $season,
          seasonYear: $seasonYear, format_in: $format
        ) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage, genre, sort, search, status, season, format })
  return {
    results: data.Page.media.map(normalizeMedia),
    pageInfo: data.Page.pageInfo,
  }
}

export async function fetchTopAiring(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC, status: RELEASING, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchTopUpcoming(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC, status: NOT_YET_RELEASED, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchPopularMovies(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchTopRatedMovies(page = 1, perPage = 10) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, format: MOVIE, sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `
  const data = await anilistFetch(query, { page, perPage })
  return data.Page.media.map(normalizeMedia)
}

export async function fetchRecommendations(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        recommendations(sort: RATING_DESC, perPage: 10) {
          edges {
            node {
              mediaRecommendation {
                ${MEDIA_FRAGMENT}
              }
            }
          }
        }
      }
    }
  `
  const data = await anilistFetch(query, { id: Number(id) })
  return data.Media.recommendations.edges
    .map((e) => e.node.mediaRecommendation)
    .filter(Boolean)
    .map(normalizeMedia)
}

function normalizeMedia(media) {
  return {
    id: media.id,
    title: media.title.english || media.title.romaji,
    japaneseTitle: media.title.native,
    romajiTitle: media.title.romaji,
    description: (media.description || '').replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim(),
    coverImage: media.coverImage.large,
    coverImageSmall: media.coverImage.medium,
    bannerImage: media.bannerImage || media.coverImage.large,
    bannerColor: media.coverImage.color,
    genres: (media.genres || []).map((g) => g.toLowerCase().replace(/ /g, '')),
    genresRaw: media.genres || [],
    rating: media.averageScore ? media.averageScore / 10 : null,
    meanScore: media.meanScore ? media.meanScore / 10 : null,
    episodes: media.episodes,
    duration: media.duration,
    status: media.status,
    format: media.format,
    season: media.season,
    releaseYear: media.seasonYear,
    trending: media.trending || 0,
    popularity: media.popularity || 0,
    favourites: media.favourites || 0,
    studio: media.studios?.nodes?.[0]?.name || '',
    nextAiringEpisode: media.nextAiringEpisode,
    streamingEpisodes: media.streamingEpisodes || [],
    trailer: media.trailer && media.trailer.site === 'youtube'
      ? { id: media.trailer.id, thumbnail: media.trailer.thumbnail }
      : null,
  }
}

function normalizeMediaDetail(media) {
  const base = normalizeMedia(media)
  return {
    ...base,
    relations: (media.relations?.edges || []).map((e) => ({
      type: e.relationType,
      id: e.node.id,
      title: e.node.title.english || e.node.title.romaji,
      romajiTitle: e.node.title.romaji,
      nativeTitle: e.node.title.native,
      coverImage: e.node.coverImage.large,
      rating: e.node.averageScore ? e.node.averageScore / 10 : null,
      format: e.node.format,
      episodes: e.node.episodes,
    })),
    characters: (media.characters?.edges || []).map((e) => ({
      role: e.role,
      id: e.node.id,
      name: e.node.name.full,
      image: e.node.image?.medium,
    })),
  }
}

export async function fetchMangaById(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        title { romaji english native }
        coverImage { large medium }
        description(asHtml: false)
        genres
        averageScore
        status
        chapters
        volumes
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english }
              coverImage { large }
              averageScore
              format
              episodes
              status
              studios(isMain: true) { nodes { name } }
            }
          }
        }
      }
    }
  `
  const data = await anilistFetch(query, { id: Number(id) })
  return data.Media
}

export async function searchMangaAnilist(search, page = 1, perPage = 5) {
  const query = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, type: MANGA, isAdult: false, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          coverImage { large }
          averageScore
          status
          chapters
          formats
        }
      }
    }
  `
  const data = await anilistFetch(query, { search, page, perPage })
  return data.Page.media
}

const ANILIST_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
  'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
  'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
]

export { ANILIST_GENRES }
