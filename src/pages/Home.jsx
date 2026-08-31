import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import HeroBanner from '../components/ui/HeroBanner'
import MediaRow from '../components/ui/MediaRow'
import ContinueWatchingCard from '../components/ui/ContinueWatchingCard'
import { SkeletonBanner, SkeletonCarousel } from '../components/ui/Skeleton'
import { fetchHomepageData, fetchPopularMovies, fetchTopRatedMovies } from '../api/anilist'
import { fetchRecentEpisodes } from '../api/anikoto'
import { getAllGenres } from '../data/mockData'
import { Flame, History, Clock3, Trophy, Sparkles, CalendarClock, Film, Star, Clapperboard } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Home() {
  const { user, removeContinueWatching } = useAuth()
  const [cwList, setCwList] = useState([])

  const { data: home, isLoading, isError: homeFailed } = useQuery({
    queryKey: ['homepage'],
    queryFn: () => fetchHomepageData(10),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  })

  const { data: popularMovies } = useQuery({
    queryKey: ['popularMovies'],
    queryFn: () => fetchPopularMovies(1, 10),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  const { data: topRatedMovies } = useQuery({
    queryKey: ['topRatedMovies'],
    queryFn: () => fetchTopRatedMovies(1, 10),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  const [recentEpisodes, setRecentEpisodes] = useState([])
  useEffect(() => {
    let cancelled = false
    fetchRecentEpisodes()
      .then((d) => { if (!cancelled) setRecentEpisodes(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const raw = user?.continueWatching?.length
      ? user.continueWatching
      : (() => { try { return JSON.parse(localStorage.getItem('cw_guest') || '[]') } catch { return [] } })()
    const valid = raw.filter((e) => e.duration > 0 && e.currentTime > 0 && e.currentTime < e.duration * 0.95)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    setCwList(valid)
  }, [user?.continueWatching])

  const heroAnime = home?.trending?.length ? home.trending : home?.popular?.length ? home.popular : home?.topRated
  const genres = getAllGenres()

  return (
    <div>
      {/* Cinematic hero — sits immediately below the top nav, no negative margin */}
      {isLoading ? (
        <SkeletonBanner />
      ) : heroAnime?.length ? (
        <HeroBanner animeList={heroAnime.slice(0, 5)} />
      ) : (
        <div className="w-full h-[500px] bg-kx-surface flex items-center justify-center">
          <p className="text-white/30">Unable to load featured anime</p>
        </div>
      )}

      {/* Rows — strong separation from hero via dark gradient fade handled inside HeroBanner;
          content starts 40px below hero with consistent horizontal padding */}
      <div className="relative z-10 space-y-10 sm:space-y-12 pt-10 pb-4">

        {cwList.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4 kx-shell-padding">
              <h2 className="flex items-center gap-3">
                <span className="kx-section-accent" />
                <span className="kx-section-title">Continue Watching</span>
                <span className="kx-count-badge hidden sm:inline-flex">{cwList.length}</span>
              </h2>
              <Link to="/history" className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-white/35 hover:text-white/65 transition-colors">
                View all
              </Link>
            </div>
            <div className="flex overflow-x-auto scrollbar-hide scroll-smooth pb-3 kx-shell-padding" style={{ gap: '16px' }}>
              {cwList.slice(0, 12).map((item) => (
                <ContinueWatchingCard key={item.animeId} item={item} onRemove={removeContinueWatching} />
              ))}
            </div>
          </section>
        )}

        {/* Degraded mode: metadata provider down — say why the rows are gone
            instead of silently showing an empty shell. */}
        {homeFailed && !home && (
          <p className="kx-shell-padding text-sm text-white/40">
            Catalogs are temporarily unavailable — our anime metadata provider is having an outage.
            Continue Watching and playback still work.
          </p>
        )}

        {isLoading ? <SkeletonCarousel /> : home?.trending?.length > 0 && (
          <MediaRow title="Trending Now" icon={Flame} animeList={home.trending} seeAllLink="/browse" />
        )}

        {recentEpisodes.length > 0 && (
          <MediaRow title="Latest Episodes" icon={Clock3} animeList={recentEpisodes} seeAllLink="/browse" size="large" />
        )}

        {isLoading ? <SkeletonCarousel /> : home?.topRated?.length > 0 && (
          <MediaRow title="Top Rated" icon={Trophy} animeList={home.topRated} seeAllLink="/browse" />
        )}

        {isLoading ? <SkeletonCarousel /> : home?.popular?.length > 0 && (
          <MediaRow title="Most Popular" icon={Sparkles} animeList={home.popular} seeAllLink="/browse" />
        )}

        {isLoading ? <SkeletonCarousel /> : home?.newReleases?.length > 0 && (
          <MediaRow title="New Releases" icon={CalendarClock} animeList={home.newReleases} seeAllLink="/browse" />
        )}

        {popularMovies?.length > 0 && (
          <MediaRow title="Popular Movies" icon={Film} animeList={popularMovies} seeAllLink="/movies" />
        )}

        {topRatedMovies?.length > 0 && (
          <MediaRow title="Top Rated Movies" icon={Star} animeList={topRatedMovies} seeAllLink="/movies" />
        )}

        {/* Genres strip */}
        <section>
          <div className="mb-4 kx-shell-padding">
            <h2 className="flex items-center gap-3">
              <span className="kx-section-accent" />
              <span className="kx-section-title">Browse by Genre</span>
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 kx-shell-padding">
            {genres.map((genre) => (
              <Link
                key={genre.id}
                to={`/genres/${genre.id}`}
                className="group relative overflow-hidden rounded-xl aspect-[3/4] border border-white/[0.06] bg-kx-surface flex items-end hover:border-white/15 transition-colors"
              >
                <img src={genre.image} alt={genre.name} loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(8,13,24,0.92) 0%, rgba(8,13,24,0.30) 45%, transparent 72%)' }} />
                <span className="relative z-10 w-full text-center text-sm font-bold text-white pb-3 drop-shadow-lg">
                  {genre.name}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {isLoading ? <SkeletonCarousel /> : home?.recentlyUpdated?.length > 0 && (
          <MediaRow title="Recently Updated" icon={Clock3} animeList={home.recentlyUpdated} seeAllLink="/browse" />
        )}

        {isLoading ? <SkeletonCarousel /> : home?.upcoming?.length > 0 && (
          <MediaRow title="Top Upcoming" icon={CalendarClock} animeList={home.upcoming} seeAllLink="/browse?status=NOT_YET_RELEASED" />
        )}
      </div>
    </div>
  )
}
