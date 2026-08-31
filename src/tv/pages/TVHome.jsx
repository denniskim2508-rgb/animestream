import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Flame, Sparkles, RefreshCw, CalendarClock } from 'lucide-react'
import { fetchHomepageData } from '../../api/anilist'
import { useAuth } from '../../context/AuthContext'
import { useTVFocusMemory } from '../TVFocusManager'
import TVHero from '../components/TVHero'
import TVRow from '../components/TVRow'
import TVAnimeCard from '../components/TVAnimeCard'
import TVHomeSkeleton from '../components/TVSkeleton'
import TVErrorState from '../components/TVErrorState'

function ContinueWatchingRow() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const items = (user?.continueWatching || []).filter((e) => e.animeId).slice(0, 10)
  if (!items.length) return null
  return (
    <div className="tv-enter">
      <TVRow title="Continue Watching" count={items.length} region="continue-watching">
        {items.map((entry) => {
          const percent = entry.progressPercent != null
            ? Math.min(100, Math.round(entry.progressPercent))
            : entry.duration > 0
              ? Math.min(100, Math.round((entry.currentTime / entry.duration) * 100))
              : 5
          return (
            <button
              key={entry.animeId}
              type="button"
              onClick={() => navigate(`/tv/watch/${entry.animeId}/${entry.episode || 1}?audio=${entry.audioMode || 'sub'}`)}
              className="tv-card relative w-[340px] shrink-0 rounded-2xl overflow-hidden text-left"
            >
              <div className="relative aspect-video w-full bg-black/50">
                {entry.coverImage && (
                  <img src={entry.coverImage} alt="" loading="lazy" className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                <span className={`absolute top-2.5 left-2.5 tv-badge ${entry.audioMode === 'dub' ? 'tv-badge-dub' : 'tv-badge-sub'}`}>
                  {entry.audioMode === 'dub' ? 'DUB' : 'SUB'}
                </span>
                <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/80 px-2 py-0.5 text-sm font-bold">EP {entry.episode}</span>
              </div>
              <div className="px-4 py-3">
                <p className="truncate text-base font-semibold leading-snug">{entry.title || 'Untitled'}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="tv-progress-track flex-1">
                    <div className="tv-progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-white/55 tabular-nums shrink-0">{percent}%</span>
                </div>
              </div>
            </button>
          )
        })}
      </TVRow>
    </div>
  )
}

export default function TVHome() {
  // Returning from Details/Player restores the exact card that launched them.
  useTVFocusMemory('home')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tv-home'],
    queryFn: () => fetchHomepageData(14),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <TVHomeSkeleton />
  if (isError) return <TVErrorState onRetry={refetch} />

  const heroList = data.trending || []

  const rest = [
    { title: 'Trending Now', icon: Flame, items: data.trending?.slice(1), count: data.trending?.length - 1, region: 'trending' },
    { title: 'Latest Releases', icon: RefreshCw, items: data.recentlyUpdated, region: 'releases' },
    { title: 'Popular This Season', icon: Sparkles, items: data.popular, region: 'popular' },
    { title: 'Upcoming Anime', icon: CalendarClock, items: data.upcoming, region: 'upcoming' },
  ].filter((s) => s.items && s.items.length)

  return (
    <div className="pb-16">
      <TVHero animeList={heroList} exitDown={rest[0]?.region} />
      <ContinueWatchingRow />
      {rest.map(({ title, icon, items, count, region }, i) => (
        <TVRow
          key={title}
          title={title}
          count={count ?? null}
          region={region}
          exitUp={i > 0 ? rest[i - 1].region : 'hero'}
          exitDown={i < rest.length - 1 ? rest[i + 1].region : null}
        >
          {(items || []).map((a, idx) => (
            <TVAnimeCard key={a.id} anime={a} exitLeft={idx === 0 ? 'navbar-home' : null} />
          ))}
        </TVRow>
      ))}
    </div>
  )
}
