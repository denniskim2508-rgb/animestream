import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Star, Play, Plus, Check, Heart, Clock, Calendar, Film, Tv, BookOpen,
  Users, Layers, Building2, Clapperboard, ChevronRight, Gauge,
} from 'lucide-react'
import { fetchMediaById, fetchRecommendations } from '../api/anilist'
import { fetchEpisodeAvailability } from '../api/anikoto'
import { buildSeasonChain } from '../utils/seasonChain'
import { useAuth } from '../context/AuthContext'
import { getStatusLabel, getFormatLabel } from '../data/mockData'
import MediaRow from '../components/ui/MediaRow'
import ShowMore from '../components/ui/ShowMore'
import { SkeletonPage } from '../components/ui/Skeleton'
import { findMangaForAnime } from '../api/crosslink'
import AiringCountdown from '../components/ui/AiringCountdown'

export default function AnimeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [epPage, setEpPage] = useState(0)
  const [linkedManga, setLinkedManga] = useState(null)
  const { user, toggleFavorite, toggleWatchlist, audioMode, setAudioMode } = useAuth()

  const { data: anime, isLoading, isError } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchMediaById(id),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(id),
  })

  const { data: recommendations = [] } = useQuery({
    queryKey: ['recs', id],
    queryFn: () => fetchRecommendations(Number(id)),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(id),
  })

  const { data: avail } = useQuery({
    queryKey: ['avail', id, anime?.title],
    queryFn: () => fetchEpisodeAvailability(id, 1, anime?.title),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(id && anime?.title),
  })

  const { data: seasons = [] } = useQuery({
    queryKey: ['seasons', id],
    queryFn: () => buildSeasonChain(id),
    staleTime: 30 * 60 * 1000,
    enabled: Boolean(id),
  })

  useEffect(() => {
    setEpPage(0)
  }, [id])

  useEffect(() => {
    if (!anime?.relations?.length) return undefined
    let cancelled = false
    findMangaForAnime(anime.relations, anime.title)
      .then((m) => { if (!cancelled) setLinkedManga(m) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [anime?.relations, anime?.title])

  if (isLoading) return <SkeletonPage />

  if (!anime || isError) {
    return (
      <div className="px-6 py-32 text-center">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Anime Not Found</h1>
        <p className="text-gray-500 mb-6">This anime could not be loaded.</p>
        <Link to="/" className="kx-btn kx-btn-primary h-11 px-6">Back Home</Link>
      </div>
    )
  }

  const isFav = user?.favorites?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)
  const inWatchlist = user?.watchlist?.some((item) => (typeof item === 'object' ? item.id : item) === anime.id)
  const resumeEntry = (user?.continueWatching || []).find((e) => e.animeId === String(anime.id))
  const startEp = resumeEntry?.episode || 1
  const epCount = anime.episodes || avail?.totalEpisodes || (anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 0)

  // Provider's real ordered episode numbers when known; otherwise 1..N.
  const episodeNumbers = Array.isArray(avail?.episodeList) && avail.episodeList.length
    ? avail.episodeList
    : Array.from({ length: Math.min(epCount || 0, 300) }, (_, i) => i + 1)

  // Per-episode watch progress for indicators.
  const cwByEp = {}
  for (const e of user?.continueWatching || []) {
    if (String(e.animeId) === String(anime.id) && e.duration > 0) {
      cwByEp[e.episode] = Math.min(100, Math.round((e.currentTime / e.duration) * 100))
    }
  }

  const EP_PAGE_SIZE = 60
  const pageCount = Math.max(1, Math.ceil(episodeNumbers.length / EP_PAGE_SIZE))
  const safePage = Math.min(epPage, pageCount - 1)
  const pageEps = episodeNumbers.slice(safePage * EP_PAGE_SIZE, (safePage + 1) * EP_PAGE_SIZE)

  const related = (anime.relations || []).filter((r) =>
    ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'].includes(r.type)
  )

  return (
    <div className="-mt-16">
      {/* ── Cinematic backdrop ── */}
      <div className="relative h-[58vh] min-h-[420px] max-h-[680px]">
        <img
          src={anime.bannerImage || anime.coverImage}
          alt=""
          className="kx-kenburns w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = anime.coverImage }}
        />
        <div className="absolute inset-0 kx-hero-vignette" />
        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 lg:px-10 pb-8 max-w-[1400px] mx-auto hidden md:block">
          <nav className="flex items-center gap-2 text-xs font-medium text-gray-400">
            <Link to="/" className="hover:text-white">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link to="/browse" className="hover:text-white">Anime</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-200 truncate max-w-[300px]">{anime.title}</span>
          </nav>
        </div>
      </div>

      {/* ── Poster + information ── */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-10 -mt-36 sm:-mt-44 max-w-[1400px] mx-auto pb-16">
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="w-40 sm:w-52 md:w-64 shrink-0 mx-auto md:mx-0">
            <img
              src={anime.coverImage}
              alt={anime.title}
              className="w-full aspect-[2/3] object-cover rounded-2xl border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.65)]"
            />
            {anime.studio && (
              <p className="hidden md:flex items-center gap-2 mt-4 text-sm text-gray-500 justify-center">
                <Building2 className="w-4 h-4" /> {anime.studio}
              </p>
            )}
          </div>

          <div className="flex-1 min-w-0 text-center md:text-left pt-2 md:pt-10">
            <h1
              className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05]"
              style={{ fontFamily: 'Outfit', letterSpacing: '-0.02em' }}
            >
              {anime.title}
            </h1>
            {(anime.romajiTitle && anime.romajiTitle !== anime.title) || anime.japaneseTitle ? (
              <p className="text-sm sm:text-base text-gray-500 mt-1.5">
                {[anime.romajiTitle !== anime.title ? anime.romajiTitle : null, anime.japaneseTitle].filter(Boolean).join(' · ')}
              </p>
            ) : null}

            {/* Metadata row */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-5 gap-y-2 mt-4 text-sm sm:text-base text-gray-300">
              {anime.rating != null && (
                <span className="inline-flex items-center gap-1.5 font-bold text-yellow-400">
                  <Star className="w-5 h-5 fill-yellow-400" /> {anime.rating.toFixed(1)}
                </span>
              )}
              {anime.releaseYear && (
                <span className="inline-flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {anime.releaseYear}</span>
              )}
              {anime.format && (
                <span className="inline-flex items-center gap-1.5"><Tv className="w-4 h-4" /> {getFormatLabel(anime.format)}</span>
              )}
              {epCount > 0 && (
                <span className="inline-flex items-center gap-1.5"><Film className="w-4 h-4" /> {epCount} Episodes</span>
              )}
              {anime.duration && (
                <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" /> {anime.duration} min</span>
              )}
              {anime.status && (
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                  anime.status === 'RELEASING'
                    ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
                    : anime.status === 'FINISHED'
                      ? 'bg-sky-400/15 text-sky-300 border-sky-400/30'
                      : 'bg-white/10 text-gray-300 border-white/15'
                }`}>
                  {getStatusLabel(anime.status)}
                </span>
              )}
              <AiringCountdown airing={anime.nextAiringEpisode} />
            </div>

            {/* Audio availability */}
            <div className="flex items-center justify-center md:justify-start gap-2 mt-4">
              <span className={`px-3 py-1 rounded-lg text-xs font-black tracking-widest ${avail?.hasSub !== false ? 'bg-cyan-glow/15 text-accent-light border border-cyan-glow/30' : 'bg-white/5 text-gray-600 border-white/5'}`}>
                SUB
              </span>
              <span className={`px-3 py-1 rounded-lg text-xs font-black tracking-widest ${avail?.hasDub ? 'bg-primary-light/15 text-primary-light border border-primary-light/30' : 'bg-white/5 text-gray-600 border-white/5'}`}>
                DUB
              </span>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
              {(anime.genresRaw || []).slice(0, 6).map((g) => (
                <Link key={g} to={`/genres/${g.toLowerCase().replace(/ /g, '')}`} className="kx-chip hover:border-cyan-glow/50 hover:text-white transition-colors">
                  {g}
                </Link>
              ))}
            </div>

            {/* Synopsis */}
            {anime.description && (
              <ShowMore text={anime.description} lines={3} className="mt-5 text-[15px] leading-relaxed text-gray-400 max-w-3xl mx-auto md:mx-0" />
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-7">
              <Link
                to={`/watch/${anime.id}/${startEp}?total=${epCount}&audio=${audioMode}`}
                className="kx-btn kx-btn-primary h-12 px-7 text-[15px]"
              >
                <Play className="w-5 h-5 fill-current" />
                {resumeEntry ? `Resume EP ${resumeEntry.episode}` : 'Watch Now'}
              </Link>
              {user && (
                <>
                  <button onClick={() => toggleWatchlist(anime)} className={`kx-btn h-12 px-6 text-[15px] ${inWatchlist ? 'kx-btn-primary' : 'kx-btn-ghost'}`}>
                    {inWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    {inWatchlist ? 'In My List' : 'My List'}
                  </button>
                  <button onClick={() => toggleFavorite(anime)} className="kx-btn kx-btn-ghost h-12 px-6 text-[15px]">
                    <Heart className={`w-5 h-5 ${isFav ? 'fill-anime-red text-anime-red' : ''}`} />
                    {isFav ? 'Favorited' : 'Favorite'}
                  </button>
                </>
              )}
              <div className="inline-flex rounded-xl overflow-hidden border border-white/10 ml-0 sm:ml-2">
                {['sub', 'dub'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setAudioMode(m)}
                    className={`h-12 px-5 text-sm font-bold transition-colors ${
                      audioMode === m ? 'bg-gradient-to-r from-accent-glow/25 to-primary/25 !bg-[linear-gradient(135deg,rgba(34,211,238,0.22),rgba(124,58,237,0.28))] text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-9 max-w-2xl mx-auto md:mx-0">
              {[
                anime.meanScore != null && { icon: Gauge, label: 'Mean Score', value: `${anime.meanScore.toFixed(1)}/10` },
                anime.season && { icon: Calendar, label: 'Season', value: `${anime.season} ${anime.releaseYear || ''}` },
                anime.popularity && { icon: Users, label: 'Popularity', value: anime.popularity.toLocaleString() },
                anime.favourites && { icon: Heart, label: 'Favorites', value: anime.favourites.toLocaleString() },
              ].filter(Boolean).map(({ icon: Icon, label, value }) => (
                <div key={label} className="kx-panel px-4 py-3">
                  <Icon className="w-4 h-4 text-accent-light mb-1.5" />
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
                  <p className="text-sm font-bold text-gray-100 truncate">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Episodes ── */}
        {episodeNumbers.length > 0 && (
          <section className="mt-16">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-5">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                <span className="w-1.5 h-7 rounded-full bg-gradient-to-b from-accent-light to-primary" />
                Episodes
              </h2>
              {seasons.length > 1 ? (
                <div className="relative inline-flex">
                  <select
                    value={String(anime.id)}
                    onChange={(e) => navigate(`/anime/${e.target.value}`)}
                    aria-label="Season"
                    className="kx-chip !py-1.5 appearance-none pr-8 cursor-pointer hover:border-cyan-glow/50 transition-colors"
                  >
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id} title={s.title}>
                        Season {s.number}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">▼</span>
                </div>
              ) : (
                <span className="kx-chip !py-1.5">Season 1</span>
              )}
              {pageCount > 1 && (
                <div className="flex items-center gap-2 ml-auto">
                  {Array.from({ length: pageCount }, (_, p) => {
                    const start = episodeNumbers[p * EP_PAGE_SIZE]
                    const end = episodeNumbers[Math.min((p + 1) * EP_PAGE_SIZE, episodeNumbers.length) - 1]
                    return (
                      <button
                        key={p}
                        onClick={() => setEpPage(p)}
                        className={`h-9 px-3.5 rounded-lg text-xs font-semibold transition-all ${
                          safePage === p
                            ? 'bg-gradient-to-r from-accent-glow/25 to-primary/25 !bg-[linear-gradient(135deg,rgba(34,211,238,0.25),rgba(124,58,237,0.3))] text-white border border-cyan-glow/40'
                            : 'bg-white/[0.05] text-gray-400 hover:text-white border border-white/5'
                        }`}
                      >
                        {start}-{end}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div key={safePage} className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
              {pageEps.map((ep) => {
                const prog = cwByEp[ep]
                const isResume = startEp === ep
                return (
                  <Link key={ep} to={`/watch/${anime.id}/${ep}?total=${epCount}&audio=${audioMode}`} className="relative group">
                    <span className={`kx-ep ${isResume || prog ? 'kx-ep-active' : ''}`}>
                      <span className="text-lg">{String(ep).padStart(2, '0')}</span>
                      {isResume && <span className="text-[9px] uppercase tracking-wider opacity-75">Resume</span>}
                    </span>
                    {prog != null && prog < 95 && (
                      <span className="absolute inset-x-2 bottom-1.5 h-1 rounded-full bg-white/20 overflow-hidden">
                        <span className="block h-full rounded-full bg-gradient-to-r from-accent-light to-primary" style={{ width: `${prog}%` }} />
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Related anime ── */}
        {related.length > 0 && (
          <section className="mt-16">
            <MediaRow title="Related Anime" icon={Layers} size="normal"
              animeList={related.map((r) => ({
                id: r.id, title: r.title, coverImage: r.coverImage,
                rating: r.rating, episodes: r.episodes, format: r.format,
                releaseYear: null, genresRaw: [], description: '',
              }))}
            />
          </section>
        )}

        {/* ── Characters ── */}
        {anime.characters?.length > 0 && (
          <section className="mt-14">
            <h2 className="flex items-center gap-3 text-xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit' }}>
              <Users className="w-5 h-5 text-accent-light" /> Characters
            </h2>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {anime.characters.slice(0, 12).map((c) => (
                <div key={c.id} className="shrink-0 w-[120px] text-center">
                  <div className="w-24 h-24 mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-lg group-hover:border-cyan-glow/40 transition-colors">
                    {c.image ? (
                      <img src={c.image} alt={c.name} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-kx-surface2 flex items-center justify-center text-xl font-black text-gray-600">{c.name[0]}</div>
                    )}
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-gray-200 truncate">{c.name}</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">{String(c.role).toLowerCase()}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Trailer ── */}
        {anime.trailer && (
          <section className="mt-14 max-w-4xl">
            <h2 className="flex items-center gap-3 text-xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit' }}>
              <Clapperboard className="w-5 h-5 text-anime-red" /> Official Trailer
            </h2>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${anime.trailer.id}?rel=0`}
                title={`${anime.title} - Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </section>
        )}

        {/* ── Recommendations ── */}
        {recommendations.length > 0 && (
          <section className="mt-14">
            <MediaRow title="You Might Also Like" icon={Star} animeList={recommendations} seeAllLink="/browse" />
          </section>
        )}

        {/* ── Manga adaptation ── */}
        {!linkedManga ? null : (
          <section className="mt-14">
            <Link to={`/manga/${linkedManga.mangaId}`} className="group block">
              <div className="kx-panel overflow-hidden hover:border-cyan-glow/35 transition-colors">
                <div className="flex flex-col md:flex-row">
                  <div className="md:w-44 shrink-0 aspect-[3/4] md:aspect-auto bg-kx-surface2">
                    {linkedManga.coverImage ? (
                      <img src={linkedManga.coverImage} alt={linkedManga.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><BookOpen className="w-9 h-9 text-gray-600" /></div>
                    )}
                  </div>
                  <div className="flex-1 p-6 flex flex-col gap-2">
                    <span className="kx-chip w-fit !border-primary-light/30 !text-primary-light">MANGA ADAPTATION</span>
                    <h3 className="text-xl font-bold text-white group-hover:text-accent-light transition-colors">{linkedManga.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      {linkedManga.status && <span className="capitalize">{linkedManga.status}</span>}
                      {linkedManga.author && <span>{linkedManga.author}</span>}
                      {linkedManga.latestChapter && <span>Latest: Ch. {linkedManga.latestChapter}</span>}
                    </div>
                    {linkedManga.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">{linkedManga.description}</p>
                    )}
                    <span className="mt-3 inline-flex w-fit items-center gap-2 kx-btn h-10 px-5 text-sm"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', boxShadow: '0 8px 26px rgba(124,58,237,0.35)' }}>
                      <BookOpen className="w-4 h-4" /> Read the manga <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}
      </div>
    </div>
  )
}
