import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import HeroBanner from '../components/ui/HeroBanner'
import AnimeCarousel from '../components/ui/AnimeCarousel'
import ContinueWatchingCard from '../components/ui/ContinueWatchingCard'
import { SkeletonBanner, SkeletonCarousel } from '../components/ui/Skeleton'
import { fetchHomepageData, fetchPopularMovies, fetchTopRatedMovies } from '../api/anilist'
import { fetchRecentEpisodes } from '../api/anikoto'
import { getAllGenres } from '../data/mockData'
import { Link } from 'react-router-dom'
import { Sparkles, History } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Home() {
  const { user, removeContinueWatching } = useAuth()
  const [cwList, setCwList] = useState([])

  const { data: home, isLoading } = useQuery({
    queryKey: ['homepage'],
    queryFn: () => fetchHomepageData(10),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
    if (user?.continueWatching?.length) {
      setCwList(user.continueWatching)
    } else {
      try {
        const guest = JSON.parse(localStorage.getItem('cw_guest') || '[]')
        setCwList(guest)
      } catch { setCwList([]) }
    }
  }, [user?.continueWatching])

  const heroAnime = home?.trending?.length ? home.trending : home?.popular?.length ? home.popular : home?.topRated
  const genres = getAllGenres()

  return (
    <div>
      {isLoading ? (
        <SkeletonBanner />
      ) : heroAnime?.length ? (
        <HeroBanner animeList={heroAnime.slice(0, 5)} />
      ) : (
        <div className="w-full h-[70vh] min-h-[500px] max-h-[800px] bg-gray-900 flex items-center justify-center">
          <p className="text-gray-500">Unable to load featured anime</p>
        </div>
      )}

      <div className="max-w-[1440px] mx-auto space-y-10 sm:space-y-14 -mt-8 relative z-10">
        {cwList.length > 0 && (
          <section className="relative group/section">
            <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-primary-light" /> Continue Watching
              </h2>
            </div>
            <div className="relative">
              <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 pb-4">
                {cwList.slice(0, 10).map((item) => (
                  <ContinueWatchingCard
                    key={`${item.animeId}-${item.episode}`}
                    item={item}
                    onRemove={removeContinueWatching}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {isLoading ? (
          <SkeletonCarousel />
        ) : home?.trending?.length > 0 ? (
          <section>
            <AnimeCarousel title="Trending Now" animeList={home.trending} seeAllLink="/browse" />
          </section>
        ) : null}

        {recentEpisodes.length > 0 && (
          <section>
            <AnimeCarousel title="Recent Episodes" animeList={recentEpisodes} seeAllLink="/browse" />
          </section>
        )}

        {isLoading ? (
          <SkeletonCarousel />
        ) : home?.topRated?.length > 0 ? (
          <section>
            <AnimeCarousel title="Top Rated" animeList={home.topRated} seeAllLink="/browse" />
          </section>
        ) : null}

        <section className="px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-light" /> Browse by Genre
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {genres.map((genre) => (
              <Link
                key={genre.id}
                to={`/genres/${genre.id}`}
                className="group relative overflow-hidden rounded-xl aspect-[3/4] flex items-end transition-all hover:scale-105 hover:shadow-xl"
              >
                <img
                  src={genre.image}
                  alt={genre.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="relative z-10 w-full text-center text-sm font-bold text-white pb-3 drop-shadow-lg">
                  {genre.name}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {isLoading ? (
          <SkeletonCarousel />
        ) : home?.popular?.length > 0 ? (
          <section>
            <AnimeCarousel title="Most Popular" animeList={home.popular} seeAllLink="/browse" />
          </section>
        ) : null}

        {isLoading ? (
          <SkeletonCarousel />
        ) : home?.recentlyUpdated?.length > 0 ? (
          <section>
            <AnimeCarousel title="Recently Updated" animeList={home.recentlyUpdated} seeAllLink="/browse" />
          </section>
        ) : null}

        {isLoading ? (
          <SkeletonCarousel />
        ) : home?.newReleases?.length > 0 ? (
          <section>
            <AnimeCarousel title="New Releases" animeList={home.newReleases} seeAllLink="/browse" />
          </section>
        ) : null}

        {popularMovies?.length > 0 ? (
          <section>
            <AnimeCarousel title="Popular Movies" animeList={popularMovies} seeAllLink="/browse?format=MOVIE" />
          </section>
        ) : null}

        {topRatedMovies?.length > 0 ? (
          <section>
            <AnimeCarousel title="Top Rated Movies" animeList={topRatedMovies} seeAllLink="/browse?format=MOVIE" />
          </section>
        ) : null}

        {isLoading ? (
          <SkeletonCarousel />
        ) : home?.upcoming?.length > 0 ? (
          <section>
            <AnimeCarousel title="Top Upcoming" animeList={home.upcoming} seeAllLink="/browse" />
          </section>
        ) : null}
      </div>
    </div>
  )
}
