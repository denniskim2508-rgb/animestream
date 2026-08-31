import { useQuery } from '@tanstack/react-query'
import { fetchPopularMovies, fetchTopRatedMovies } from '../api/anilist'
import MediaRow from '../components/ui/MediaRow'
import { SkeletonCarousel } from '../components/ui/Skeleton'
import { Film, Star } from 'lucide-react'

export default function Movies() {
  const { data: popular, isLoading: pLoading } = useQuery({
    queryKey: ['movies-popular'],
    queryFn: () => fetchPopularMovies(1, 20),
    staleTime: 5 * 60 * 1000,
  })
  const { data: topRated, isLoading: tLoading } = useQuery({
    queryKey: ['movies-top'],
    queryFn: () => fetchTopRatedMovies(1, 20),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="py-10 space-y-12">
      <div className="px-4 sm:px-6 lg:px-10">
        <h1 className="flex items-center gap-3 text-3xl font-black text-white" style={{ fontFamily: 'Outfit' }}>
          <span className="w-1.5 h-8 rounded-full bg-gradient-to-b from-accent-light to-primary" />
          Anime Movies
        </h1>
        <p className="text-gray-500 mt-2">Feature films from across the anime universe.</p>
      </div>

      {pLoading ? <SkeletonCarousel /> : <MediaRow title="Popular Movies" icon={Film} animeList={popular || []} size="large" />}
      {tLoading ? <SkeletonCarousel /> : <MediaRow title="Highest Rated" icon={Star} animeList={topRated || []} size="large" />}
    </div>
  )
}
