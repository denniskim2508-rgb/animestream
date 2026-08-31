import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play, Bookmark, Star, Check, Users, Layers, Library, Tv, Sparkles } from 'lucide-react'
import { fetchMediaById, fetchRecommendations } from '../../api/anilist'
import { fetchEpisodeAvailability } from '../../api/anikoto'
import { fetchTMDBEpisodes, tmdbStillUrl } from '../../api/tmdb'
import { buildSeasonChain } from '../../utils/seasonChain'
import { useAuth } from '../../context/AuthContext'
import { useFocusable, useTVFocus, useTVFocusMemory } from '../TVFocusManager'
import TVButton from '../components/TVButton'
import TVAnimeCard from '../components/TVAnimeCard'
import TVErrorState from '../components/TVErrorState'
import AiringCountdown from '../../components/ui/AiringCountdown'

function epLabel(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

const TABS = [
  { id: 'episodes', label: 'Episodes', icon: Play },
  { id: 'seasons', label: 'Seasons', icon: Library },
  { id: 'recommendations', label: 'Recommendations', icon: Sparkles },
  { id: 'related', label: 'Related', icon: Layers },
]

export default function TVAnimeDetails() {
  const { animeId } = useParams()
  const navigate = useNavigate()
  const { user, toggleWatchlist } = useAuth()

  // Restore focus to the exact chip/button that launched the page when returning.
  useTVFocusMemory(`anime:${animeId}`)

  const { data: anime, isLoading, isError, refetch } = useQuery({
    queryKey: ['tv-anime', animeId],
    queryFn: () => fetchMediaById(animeId),
    staleTime: 10 * 60 * 1000,
  })

  const enabled = Boolean(animeId)

  const { data: avail } = useQuery({
    queryKey: ['tv-avail', animeId, anime?.title],
    queryFn: () => fetchEpisodeAvailability(animeId, 1, anime?.title),
    enabled: enabled && Boolean(anime?.title),
    staleTime: 5 * 60 * 1000,
  })

  const { data: seasons = [] } = useQuery({
    queryKey: ['tv-seasons', animeId],
    queryFn: () => buildSeasonChain(animeId),
    enabled,
    staleTime: 30 * 60 * 1000,
  })

  // TMDB episode metadata (still titles/descriptions). matched:false when no
  // confident title+year match; the page falls back to its plain numeric grid.
  const { data: tmdb = { matched: false } } = useQuery({
    queryKey: ['tv-tmdb', animeId],
    queryFn: () => fetchTMDBEpisodes(animeId, { title: anime?.title, year: anime?.releaseYear }),
    enabled: Boolean(anime?.title),
    staleTime: 24 * 60 * 60 * 1000,
  })

  const { data: recommendations = [] } = useQuery({
    queryKey: ['tv-recs', animeId],
    queryFn: () => fetchRecommendations(animeId),
    enabled,
    staleTime: 10 * 60 * 1000,
  })

  const [tab, setTab] = useState('episodes')

  if (isLoading) {
    return (
      <div className="px-16 py-8">
        <div className="tv-skeleton w-full h-[38vh] mb-6" />
        <div className="tv-skeleton w-1/2 h-8 mb-3" />
        <div className="tv-skeleton w-full h-20" />
      </div>
    )
  }
  if (isError || !anime) return <TVErrorState onRetry={refetch} />

  const inWatchlist = (user?.watchlist || []).some((w) => String(w.animeId ?? w.id) === String(anime.id))
  const resume = (user?.continueWatching || []).find((e) => e.animeId === String(anime.id))
  const startEp = resume?.episode || 1
  const totalEps = anime.episodes || avail?.totalEpisodes || 0
  const airingNext = anime.nextAiringEpisode?.episode

  // Provider's REAL episode numbers when known; otherwise 1..N. Never render a
  // grid that lies about what exists. Still-airing titles with no provider
  // count (anime.episodes is null and the provider returns nothing) fall back
  // to the last 100 released episodes derived from the next airing episode, so
  // the grid is never empty and shows the episodes users actually watch.
  let episodeNumbers
  if (Array.isArray(avail?.episodeList) && avail.episodeList.length) {
    episodeNumbers = avail.episodeList
  } else if (totalEps > 0) {
    episodeNumbers = Array.from({ length: totalEps }, (_, i) => i + 1)
  } else if (airingNext && airingNext > 1) {
    const released = airingNext - 1
    const start = Math.max(1, released - 99)
    episodeNumbers = Array.from({ length: released - start + 1 }, (_, i) => start + i)
  } else {
    episodeNumbers = []
  }

  const cwByEp = {}
  for (const e of user?.continueWatching || []) {
    if (e.animeId === String(anime.id) && e.duration > 0 && Number(e.episode) !== startEp) {
      cwByEp[e.episode] = Math.min(100, Math.round((e.currentTime / e.duration) * 100))
    }
  }

  const related = (anime.relations || [])
    .filter((r) => ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'].includes(r.type))
    .slice(0, 14)

  const watchlistObj = {
    animeId: String(anime.id),
    id: anime.id,
    title: anime.title,
    coverImage: anime.coverImage,
    episodes: anime.episodes,
    rating: anime.rating,
    releaseYear: anime.releaseYear,
  }

  return (
    <div className="pb-24 tv-enter">
      {/* ── Compact hero header (banner + title/actions), grouped as a <section>
        so the focus engine's auto-scroll reveals it when focus returns UP from
        content below ── */}
      <section>
        {/* Compact full-width hero backdrop (width 100%, limited height).
            overflow-hidden clips the Ken-Burns-scaled image so it can never
            bleed past container edge as a bright strip below the fade/vignette. */}
        <div className="relative w-full h-[40vh] min-h-[200px] max-h-[420px] overflow-hidden">
          <img src={anime.bannerImage || anime.coverImage} alt="" className="tv-hero-banner w-full h-full object-cover bg-black" />
          <div className="absolute inset-0 tv-hero-fade" />
          <div className="absolute inset-0 tv-vignette" />
        </div>

        {/* Title + actions (left-aligned, keeps background visible on the right) */}
      <div className="px-16 -mt-36 relative z-10 max-w-[72%]">
        <h1
          className="font-black mb-2 drop-shadow-[0_3px_16px_rgba(0,0,0,0.9)]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            letterSpacing: '-0.02em',
            fontSize: 'clamp(26px, 2.6vw, 46px)',
            lineHeight: 1.08,
          }}
        >
          {anime.title}
        </h1>

        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-base text-white/80 mb-3">
          {typeof anime.rating === 'number' && anime.rating > 0 && (
            <span className="inline-flex items-center gap-1.5 font-bold text-yellow-400">
              <Star className="w-5 h-5 fill-yellow-400" /> {(Math.round(anime.rating * 10) / 10).toFixed(1)}
            </span>
          )}
          {anime.releaseYear && <span>{anime.releaseYear}</span>}
          {anime.format && <span className="uppercase tracking-wide">{String(anime.format)}</span>}
          {totalEps ? <span>{totalEps} Episodes</span> : null}
          {anime.status && (
            <span className="capitalize text-white/60">{String(anime.status).toLowerCase().replace('_', ' ')}</span>
          )}
        </div>

        <div className="flex items-center gap-2.5 mb-3">
          <span className={`tv-badge !text-sm px-2.5 py-1 ${avail?.hasSub === false ? 'opacity-35 grayscale' : 'tv-badge-sub'}`}>SUB</span>
          <span className={`tv-badge !text-sm px-2.5 py-1 ${avail?.hasDub ? 'tv-badge-dub' : 'opacity-35 grayscale border border-white/15 text-white/50'}`}>DUB</span>
          <AiringCountdown airing={anime.nextAiringEpisode} />
        </div>

        {anime.genresRaw?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {anime.genresRaw.slice(0, 6).map((g) => (
              <span key={g} className="rounded-full bg-white/[0.08] border border-white/15 px-3.5 py-0.5 text-sm text-white/85">{g}</span>
            ))}
          </div>
        )}

        {anime.description && (
          <p className="tv-clamp-2 text-[15px] text-white/65 leading-snug max-w-xl mb-4">{anime.description}</p>
        )}

        {/* Action bar: Play / Add to List */}
        <div className="flex items-center gap-4 flex-wrap">
          <TVButton
            icon={Play}
            region="actions"
            autoFocus
            onClick={() => navigate(`/tv/watch/${anime.id}/${startEp}?audio=${resume?.audioMode || 'sub'}`)}
          >
            {resume ? `Resume · EP ${epLabel(resume.episode)}` : 'Watch Now'}
          </TVButton>
          <TVButton
            variant="ghost"
            icon={inWatchlist ? Check : Bookmark}
            region="actions"
            onClick={() => toggleWatchlist(watchlistObj)}
          >
            {inWatchlist ? 'In My List' : 'My List'}
          </TVButton>
        </div>
      </div>
      </section>

      {/* ── Tab bar ── */}
      <div className="mt-7 px-16">
        <div className="flex items-center gap-4 mb-7">
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              tab={t}
              selected={tab === t.id}
              onSelect={setTab}
              autoFocus={false}
            />
          ))}
        </div>

        <div className="mt-2">
          {tab === 'episodes' && (
            <EpisodesPanel
              key="episodes"
              anime={anime}
              episodeNumbers={episodeNumbers}
              startEp={startEp}
              cwByEp={cwByEp}
              hasDub={Boolean(avail?.hasDub)}
              tmdb={tmdb}
            />
          )}
          {tab === 'seasons' && (
            <SeasonsPanel key="seasons" animeIdStr={String(anime.id)} seasons={seasons} tmdb={tmdb} onNavigate={navigate} />
          )}
          {tab === 'recommendations' && (
            <RecommendationsPanel key="recommendations" recommendations={recommendations} />
          )}
          {tab === 'related' && (
            <RelatedPanel key="related" related={related} characters={anime.characters || []} />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({ tab, selected, onSelect }) {
  const focus = useFocusable({ onSelect: () => onSelect(tab.id), region: 'tabs' })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => onSelect(tab.id)}
      className={`tv-card rounded-full px-6 py-3 text-lg font-bold inline-flex items-center gap-2.5 border transition-colors ${
        selected ? 'bg-white/[0.14] border-white/60 text-white' : 'bg-white/[0.05] border-white/10 text-white/70 hover:text-white'
      }`}
    >
      <tab.icon className="w-5 h-5" />
      {tab.label}
    </button>
  )
}

/* ── Episodes tab ─────────────────────────────────────────────────────────── */

function EpisodesPanel({ anime, episodeNumbers, startEp, cwByEp, hasDub, tmdb }) {
  // For title-long lists (One Piece etc.) we page the grid in chunks of 100 so
  // the WebView never mounts thousands of tiles at once. Chunk size 100 keeps
  // each page a clean multiple of the 4-column layout.
  const CHUNK = 100
  const longList = episodeNumbers.length > CHUNK
  const [page, setPage] = useState(() => {
    if (!longList) return 0
    // Open on the chunk containing the resume episode when one exists.
    const startIdx = Math.max(0, episodeNumbers.indexOf(startEp))
    return Math.floor(startIdx / CHUNK)
  })

  const chunkCount = longList ? Math.ceil(episodeNumbers.length / CHUNK) : 1
  const visiblePages = longList
    ? Array.from({ length: chunkCount }, (_, i) => {
        const from = i * CHUNK + 1
        const to = Math.min((i + 1) * CHUNK, episodeNumbers.length)
        return { page: i, label: `${from} – ${to}` }
      })
    : []
  const visibleEpisodeNumbers = longList
    ? episodeNumbers.slice(page * CHUNK, page * CHUNK + CHUNK)
    : episodeNumbers

  // Decorate the app's real streamable episode numbers with TMDB still/title/
  // desc when a confident, unambiguous match exists (first TMDB season), else
  // fall back to a plain numbered tile with anime artwork.
  const byNum = useMemo(() => {
    const m = new Map()
    for (const ep of tmdb?.episodes || []) {
      if (ep.season === 1 && !m.has(ep.episode)) m.set(ep.episode, ep)
    }
    return m
  }, [tmdb])

  if (!episodeNumbers.length) return <EmptyTab label="No episodes available for this title yet." />

  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <span className="tv-accent-bar" />
        <h2 className="text-[1.55rem] font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Episodes</h2>
        <span className="text-sm font-semibold text-white/40 bg-white/[0.06] border border-white/10 rounded-full px-3 py-0.5">
          {episodeNumbers.length}
        </span>
        {tmdb?.matched && (
          <span className="text-sm font-semibold text-white/45 bg-white/[0.06] border border-white/10 rounded-full px-3 py-0.5">
            from {tmdb.showName}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-5">
        {visibleEpisodeNumbers.map((ep) => (
          <EpisodeTile
            key={ep}
            ep={ep}
            animeId={anime.id}
            episodes={visibleEpisodeNumbers}
            banner={anime.bannerImage || anime.coverImage}
            meta={byNum.get(ep)}
            current={startEp === ep}
            progress={cwByEp[ep] ?? null}
            hasDub={hasDub}
          />
        ))}
      </div>
      {longList && (
        <div className="mt-7">
          <p className="text-sm font-bold text-white/45 mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Jump to episode range
          </p>
          <div className="flex flex-wrap gap-2.5">
            {visiblePages.map(({ page: p, label }) => (
              <PageChip key={p} label={label} selected={p === page} onSelect={() => setPage(p)} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function PageChip({ label, selected, onSelect }) {
  const focus = useFocusable({ onSelect, region: 'episodes' })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onSelect}
      className={`tv-card rounded-full px-4 py-2 text-sm font-bold border transition-colors ${
        selected
          ? 'bg-white/[0.14] border-white/60 text-white'
          : 'bg-white/[0.05] border-white/10 text-white/70 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function EpisodeTile({ ep, animeId, episodes, banner, meta, current, progress, hasDub }) {
  const navigate = useNavigate()
  const { applyFocus } = useTVFocus()

  // Deterministic row-major navigation over a fixed 4-column grid. D-pad moves
  // always target the episode at the intended grid offset rather than the focus
  // engine's generic geometry, so no erratic "skip"/"jump up" can happen at
  // row edges or a partial last row. `up` from the first row is left to the
  // engine so it can exit to the tabs/actions above (and the hero scroll).
  const idx = episodes.indexOf(ep)
  const COLS = 4
  const total = episodes.length
  const onArrow = (dir) => {
    if (idx < 0) return false // unknown index → fall back to engine navigation
    let target = null
    if (dir === 'right') {
      if ((idx % COLS) !== COLS - 1 && idx + 1 < total) target = episodes[idx + 1]
    } else if (dir === 'left') {
      if (idx % COLS !== 0 && idx - 1 >= 0) target = episodes[idx - 1]
    } else if (dir === 'down') {
      if (idx + COLS < total) target = episodes[idx + COLS]
    } else if (dir === 'up') {
      if (idx - COLS >= 0) target = episodes[idx - COLS]
      else return false // let the engine exit up to tabs/actions
    }
    if (target !== null) applyFocus(`ep-${target}`)
    return true // consumed: stay put at grid edges (no geometric jump)
  }

  const focus = useFocusable({
    onSelect: () => navigate(`/tv/watch/${animeId}/${ep}`),
    onArrow,
    autoFocus: current,
    region: 'episodes',
    focusKey: `ep-${ep}`,
  })
  const thumb = meta?.stillPath ? tmdbStillUrl(meta.stillPath) : null
  const name = meta?.name || `Episode ${epLabel(ep)}`
  const overview = meta?.overview || ''
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => navigate(`/tv/watch/${animeId}/${ep}`)}
      className={`tv-card relative rounded-2xl overflow-hidden text-left ${current ? '!border-cyan-300/70' : ''}`}
    >
      <div className="relative aspect-video w-full bg-black/50">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover opacity-90" />
        ) : (
          <img src={banner} alt="" loading="lazy" className="w-full h-full object-cover opacity-75" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none" />
        <span className="absolute top-2 left-2.5 text-[26px] font-black text-white drop-shadow-lg tabular-nums" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {epLabel(ep).padStart(2, '0')}
        </span>
        <span className="absolute top-2.5 right-2.5 tv-badge tv-badge-sub">SUB</span>
        {hasDub && <span className="absolute top-2.5 right-12 tv-badge tv-badge-dub">DUB</span>}
        {current && <span className="absolute bottom-2.5 right-2.5 tv-badge tv-badge-dub">RESUME</span>}
        {progress != null && progress < 95 && (
          <span className="absolute inset-x-2.5 bottom-1.5 tv-progress-track !h-[4px]">
            <span className="tv-progress-fill block" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      <div className="p-3 min-h-[74px]">
        <p className="text-[15px] font-bold text-white/95 leading-snug truncate">{name}</p>
        {overview && <p className="tv-clamp-2 text-[13px] text-white/50 leading-snug mt-1">{overview}</p>}
      </div>
    </button>
  )
}

/* ── Seasons tab ──────────────────────────────────────────────────────────── */

function SeasonsPanel({ animeIdStr, seasons, tmdb, onNavigate }) {
  const franchise = seasons.length > 1 ? seasons : []
  const hasTMDBSeasons = tmdb?.matched && (tmdb.seasons || []).length > 0

  if (!franchise.length && !hasTMDBSeasons) {
    return <EmptyTab label="No season information available for this title." />
  }

  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <Library className="w-6 h-6 text-purple-300" />
        <h2 className="text-[1.55rem] font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Seasons</h2>
        <span className="text-sm font-semibold text-white/40 bg-white/[0.06] border border-white/10 rounded-full px-3 py-0.5">
          {franchise.length || (tmdb?.seasons || []).length}
        </span>
      </div>

      {franchise.length > 0 && (
        <>
          <div className="flex gap-4 flex-wrap">
            {franchise.map((s) => (
              <SeasonChip
                key={s.id}
                season={s}
                active={String(s.id) === animeIdStr}
                onSelect={() => onNavigate(`/tv/anime/${s.id}`)}
              />
            ))}
          </div>
          <p className="text-sm text-white/45 mt-3">Jump between seasons of this franchise.</p>
        </>
      )}

      {hasTMDBSeasons && (
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="tv-accent-bar" />
            <h3 className="text-xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>On {tmdb.showName}</h3>
          </div>
          <div className="grid grid-cols-4 gap-5">
            {(tmdb.seasons || []).map((s) => (
              <div key={s.number} className="tv-card rounded-2xl px-6 py-5 border bg-white/[0.03]">
                <p className="text-2xl font-black text-purple-300" style={{ fontFamily: "'Outfit', sans-serif" }}>S{s.number}</p>
                <p className="mt-1 text-base font-semibold text-white/90 truncate">{s.name || `Season ${s.number}`}</p>
                <p className="text-sm text-white/45 mt-0.5">{s.episodeCount} episodes</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* ── Recommendations tab ──────────────────────────────────────────────────── */

function RecommendationsPanel({ recommendations }) {
  if (!recommendations.length) return <EmptyTab label="No recommendations available for this title yet." />
  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-fuchsia-300" />
        <h2 className="text-[1.55rem] font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>You Might Also Like</h2>
        <span className="text-sm font-semibold text-white/40 bg-white/[0.06] border border-white/10 rounded-full px-3 py-0.5">
          {recommendations.length}
        </span>
      </div>
      <div className="flex gap-6 flex-wrap">
        {recommendations.map((rec) => (
          <TVAnimeCard key={rec.id} anime={rec} />
        ))}
      </div>
    </section>
  )
}

/* ── Related tab ──────────────────────────────────────────────────────────── */

function RelatedPanel({ related, characters }) {
  const showRelated = related.length > 0
  const showCharacters = characters.length > 0
  if (!showRelated && !showCharacters) return <EmptyTab label="No related content for this title yet." />

  return (
    <section className="space-y-12">
      {showRelated && (
        <div>
          <div className="mb-5 flex items-center gap-3">
            <Layers className="w-6 h-6 text-purple-300" />
            <h2 className="text-[1.55rem] font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Related Anime</h2>
          </div>
          <div className="flex gap-5 flex-wrap">
            {related.map((r) => (
              <RelatedCard key={r.id} relation={r} />
            ))}
          </div>
        </div>
      )}

      {showCharacters && (
        <div>
          <div className="mb-5 flex items-center gap-3">
            <Users className="w-6 h-6 text-cyan-300" />
            <h2 className="text-[1.55rem] font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Characters</h2>
          </div>
          <div className="flex gap-6 flex-wrap">
            {characters.slice(0, 14).map((c) => (
              <div key={c.id} className="shrink-0 w-[150px] text-center">
                <div className="w-[120px] h-[120px] mx-auto rounded-2xl overflow-hidden border border-white/12 shadow-xl">
                  {c.image ? (
                    <img src={c.image} alt={c.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white/20 bg-white/[0.04]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      {(c.name || '?')[0]}
                    </div>
                  )}
                </div>
                <p className="mt-2.5 text-[15px] font-semibold text-white/90 truncate">{c.name}</p>
                <p className="text-xs uppercase tracking-wider text-white/40">{String(c.role).toLowerCase()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* ── Shared building blocks ───────────────────────────────────────────────── */

function EmptyTab({ label }) {
  return (
    <div className="tv-card rounded-2xl px-8 py-12 text-center">
      <Tv className="w-10 h-10 mx-auto mb-4 text-white/25" />
      <p className="text-lg text-white/50">{label}</p>
    </div>
  )
}

function SeasonChip({ season, active, onSelect }) {
  const focus = useFocusable({ onSelect, region: 'seasons' })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onSelect}
      title={season.title}
      className={`tv-card rounded-2xl px-7 py-4 text-lg font-bold border transition-colors ${
        active
          ? 'bg-[var(--color-primary)] text-white border-transparent'
          : 'bg-white/[0.06] text-white/80 border-white/12'
      }`}
    >
      Season {season.number}
    </button>
  )
}

function RelatedCard({ relation }) {
  const navigate = useNavigate()
  const [imgOk, setImgOk] = useState(true)
  const focus = useFocusable({ onSelect: () => navigate(`/tv/anime/${relation.id}`), region: 'related' })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => navigate(`/tv/anime/${relation.id}`)}
      className="tv-card relative w-[190px] shrink-0 rounded-2xl overflow-hidden text-left"
    >
      <div className="relative aspect-[2/3] w-full bg-black/40">
        {imgOk && relation.coverImage && (
          <img src={relation.coverImage} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setImgOk(false)} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
        <span className="absolute top-2.5 left-2.5 tv-badge tv-badge-dub">{relation.type.replace('_', ' ')}</span>
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
          <p className="tv-clamp-2 text-base font-semibold leading-snug text-white">{relation.title}</p>
        </div>
      </div>
    </button>
  )
}
