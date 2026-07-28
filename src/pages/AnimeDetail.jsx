import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Star, Play, Plus, Check, Heart, Clock, Calendar, Film, Tv } from 'lucide-react'
import { fetchMediaById, fetchRecommendations } from '../api/anilist'
import { getAnimeDetails, getEpisodes } from '../api/anikoto'
import { useAuth } from '../context/AuthContext'
import { getStatusLabel, getFormatLabel } from '../data/mockData'
import GenreTag from '../components/ui/GenreTag'
import AnimeCard from '../components/ui/AnimeCard'
import ShowMore from '../components/ui/ShowMore'
import { SkeletonPage } from '../components/ui/Skeleton'

export default function AnimeDetail() {
  const { id } = useParams()
  const [anime, setAnime] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [epPage, setEpPage] = useState(0)
  const [hasSub, setHasSub] = useState(false)
  const [hasDub, setHasDub] = useState(false)
  const { user, toggleFavorite, toggleWatchlist, audioMode, setAudioMode } = useAuth()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setEpPage(0)

    Promise.all([
      fetchMediaById(id).catch(() => null),
      fetchRecommendations(Number(id)).catch(() => []),
    ])
      .then(([animeData, recs]) => {
        if (!cancelled) {
          setAnime(animeData)
          setRecommendations(recs)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load anime')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getAnimeDetails(id)
      .then(async (details) => {
        if (cancelled || !details?.slug) return
        const eps = await getEpisodes(details.slug)
        if (cancelled) return
        const sub = eps.some((e) => e.hasSub)
        const dub = eps.some((e) => e.hasDub)
        setHasSub(sub)
        setHasDub(dub)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])

  if (loading) return <SkeletonPage />

  if (!anime || error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Anime Not Found</h1>
          <p className="text-gray-400 mb-4">{error || 'This anime could not be loaded'}</p>
          <Link to="/home" className="text-primary-light hover:underline">Go Home</Link>
        </div>
      </div>
    )
  }

  const isFav = user?.favorites?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)
  const inWatchlist = user?.watchlist?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)
  const epCount = anime.episodes || (anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 0)
  const watchUrl = `/watch/${anime.id}/1?total=${epCount}&audio=${audioMode}`
  const EP_PAGE_SIZE = 100

  return (
    <div>
      <div className="relative w-full h-[50vh] sm:h-[60vh] max-h-[700px] overflow-hidden">
        <img
          src={anime.bannerImage || anime.coverImage}
          alt={anime.title}
          className="w-full h-full object-cover"
          onError={(e) => { e.target.src = anime.coverImage }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950/80 to-transparent hidden sm:block" />
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 -mt-48 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="w-48 sm:w-56 md:w-64 shrink-0 mx-auto md:mx-0">
            <div className="aspect-[3/4] rounded-xl overflow-hidden shadow-2xl shadow-black/50 border-2 border-white/10">
              <img
                src={anime.coverImage}
                alt={anime.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-4 md:pt-8">
            <div className="flex flex-wrap gap-2 mb-3">
              {anime.genresRaw.slice(0, 4).map((g) => (
                <Link key={g} to={`/genres/${g.toLowerCase().replace(/ /g, '')}`}>
                  <GenreTag genreName={g} size="md" />
                </Link>
              ))}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-1 leading-tight">
              {anime.title}
            </h1>
            {anime.romajiTitle && anime.romajiTitle !== anime.title && (
              <p className="text-lg text-gray-400 mb-1 font-medium">{anime.romajiTitle}</p>
            )}
            {anime.japaneseTitle && (
              <p className="text-base text-gray-500 mb-4">{anime.japaneseTitle}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-5">
              {hasSub && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-primary/20 text-primary-light border border-primary/30">SUB</span>
              )}
              {hasDub && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">DUB</span>
              )}
              {anime.rating != null && (
                <div className="flex items-center gap-1.5">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  <span className="text-xl font-bold text-white">{anime.rating}</span>
                </div>
              )}
              {anime.releaseYear && (
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> {anime.releaseYear}
                </span>
              )}
              {epCount > 0 && (
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  <Film className="w-4 h-4" /> {epCount} Episodes
                </span>
              )}
              {anime.duration && (
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  <Clock className="w-4 h-4" /> {anime.duration} min/ep
                </span>
              )}
              {anime.format && (
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  <Tv className="w-4 h-4" /> {getFormatLabel(anime.format)}
                </span>
              )}
              {anime.status && (
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                  anime.status === 'RELEASING' ? 'bg-green-400/20 text-green-400 border border-green-400/30'
                  : anime.status === 'FINISHED' ? 'bg-blue-400/20 text-blue-400 border border-blue-400/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                }`}>
                  {getStatusLabel(anime.status)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs text-gray-500 uppercase tracking-wider mr-1">Audio</span>
              <button
                onClick={() => setAudioMode('sub')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  audioMode === 'sub'
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Sub (Japanese)
              </button>
              <button
                onClick={() => setAudioMode('dub')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  audioMode === 'dub'
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Dub (English)
              </button>
            </div>

            {anime.description && (
              <ShowMore text={anime.description} lines={4} className="mb-6 max-w-3xl" />
            )}

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Link
                to={watchUrl}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-full transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-95"
              >
                <Play className="w-5 h-5 fill-white" /> Watch Now
                <span className="text-xs opacity-70 uppercase">{audioMode === 'sub' ? 'JP' : 'EN'}</span>
              </Link>
              {user && (
                <>
                  <button
                    onClick={() => toggleWatchlist(anime)}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full backdrop-blur-sm transition-all active:scale-95"
                  >
                    {inWatchlist ? <Check className="w-5 h-5 text-green-400" /> : <Plus className="w-5 h-5" />}
                    {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                  </button>
                  <button
                    onClick={() => toggleFavorite(anime)}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full backdrop-blur-sm transition-all active:scale-95"
                  >
                    <Heart className={`w-5 h-5 ${isFav ? 'text-anime-red fill-anime-red' : ''}`} />
                    {isFav ? 'Favorited' : 'Favorite'}
                  </button>
                </>
              )}
            </div>

              {anime.studio && (
              <p className="text-sm text-gray-500">
                Studio: <span className="text-gray-400">{anime.studio}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-12">
          <div className="flex items-center gap-1 border-b border-white/10 mb-6">
            {['overview', 'episodes', 'trailer', 'relations', 'characters'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'text-white border-primary'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
              {[
                anime.releaseYear && { label: 'Release Year', value: anime.releaseYear },
                epCount > 0 && { label: 'Episodes', value: epCount },
                anime.duration && { label: 'Episode Duration', value: `${anime.duration} min` },
                anime.format && { label: 'Format', value: getFormatLabel(anime.format) },
                anime.status && { label: 'Status', value: getStatusLabel(anime.status) },
                anime.studio && { label: 'Studio', value: anime.studio },
                anime.season && { label: 'Season', value: `${anime.season} ${anime.releaseYear}` },
                anime.rating != null && { label: 'Score', value: `${anime.rating} / 10` },
                anime.meanScore != null && { label: 'Mean Score', value: `${anime.meanScore} / 10` },
                { label: 'Genres', value: anime.genresRaw.join(', ') },
              ].filter(Boolean).map((item) => (
                <div key={item.label} className="flex items-start gap-3 bg-white/[0.02] rounded-lg p-3">
                  <span className="text-sm text-gray-500 w-32 shrink-0">{item.label}</span>
                  <span className="text-sm text-white font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'episodes' && (
            <div className="max-w-3xl">
              {epCount > 0 ? (
                <div>
                  {epCount > EP_PAGE_SIZE && (
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {Array.from({ length: Math.ceil(epCount / EP_PAGE_SIZE) }, (_, i) => i).map((p) => {
                        const start = p * EP_PAGE_SIZE + 1
                        const end = Math.min((p + 1) * EP_PAGE_SIZE, epCount)
                        return (
                          <button
                            key={p}
                            onClick={() => setEpPage(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              epPage === p
                                ? 'bg-primary text-white'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {start}-{end}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    {Array.from(
                      { length: Math.min(EP_PAGE_SIZE, epCount - epPage * EP_PAGE_SIZE) },
                      (_, i) => epPage * EP_PAGE_SIZE + i + 1
                    ).map((ep) => (
                      <Link
                        key={ep}
                        to={`/watch/${anime.id}/${ep}?total=${epCount}&audio=${audioMode}`}
                        className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-white/[0.04] transition-colors group"
                      >
                        <span className="text-sm font-mono text-gray-500 w-8 shrink-0 text-right">{ep}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200 truncate group-hover:text-white transition-colors">
                            Episode {ep}
                          </p>
                        </div>
                        <Play className="w-4 h-4 text-gray-500 group-hover:text-primary-light transition-colors shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <Play className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No episodes available for this anime</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'trailer' && (
            <div>
              {anime.trailer ? (
                <div className="max-w-3xl">
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-900 shadow-2xl">
                    <iframe
                      src={`https://www.youtube.com/embed/${anime.trailer.id}?rel=0`}
                      title={`${anime.title} - Trailer`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-3">Official trailer on YouTube</p>
                </div>
              ) : anime.streamingEpisodes?.length > 0 ? (
                <div className="max-w-3xl">
                  <p className="text-sm text-gray-400 mb-4">Available streaming episodes</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {anime.streamingEpisodes.slice(0, 8).map((ep, i) => (
                      <div key={i} className="bg-white/[0.03] rounded-xl overflow-hidden">
                        {ep.thumbnail && (
                          <img src={ep.thumbnail} alt={ep.title} className="w-full aspect-video object-cover" />
                        )}
                        <div className="p-3">
                          <p className="text-sm text-gray-200 truncate">{ep.title}</p>
                          {ep.site && <p className="text-xs text-gray-500 mt-1">{ep.site}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 max-w-3xl">
                  <Play className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No trailer available for this anime</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'relations' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {anime.relations.filter((r) => ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'ADAPTATION'].includes(r.type)).length === 0 ? (
                <p className="text-gray-500 col-span-full py-10 text-center">No related anime found</p>
              ) : (
                anime.relations
                  .filter((r) => ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'ADAPTATION'].includes(r.type))
                  .map((rel) => (
                    <Link key={rel.id} to={`/anime/${rel.id}`} className="group">
                      <div className="aspect-[3/4] rounded-xl overflow-hidden anime-card-hover">
                        <img src={rel.coverImage} alt={rel.title} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{rel.type.replace(/_/g, ' ').toLowerCase()}</p>
                      <p className="text-sm text-white truncate group-hover:text-primary-light transition-colors">{rel.title}</p>
                    </Link>
                  ))
              )}
            </div>
          )}

          {activeTab === 'characters' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {anime.characters.length === 0 ? (
                <p className="text-gray-500 col-span-full py-10 text-center">No character data available</p>
              ) : (
                anime.characters.map((char) => (
                  <div key={char.id} className="flex items-center gap-3 bg-white/[0.02] rounded-xl p-3">
                    {char.image ? (
                      <img src={char.image} alt={char.name} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-gray-500 text-sm font-bold">
                        {char.name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{char.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{char.role}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {recommendations.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xl font-bold text-white mb-6">You Might Also Like</h2>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
              {recommendations.map((a) => (
                <AnimeCard key={a.id} anime={a} size="normal" />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
