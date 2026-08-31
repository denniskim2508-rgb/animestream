import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Tv as TvIcon, Clapperboard, ArrowLeft } from 'lucide-react'
import { fetchBrowse } from '../../api/anilist'
import { useFocusable, useFocusContainer, useTVBackHandler, TVContainerContext, TVRegionContext } from '../TVFocusManager'
import TVAnimeCard from '../components/TVAnimeCard'
import TVErrorState from '../components/TVErrorState'
import TVButton from '../components/TVButton'

const SORTS = [
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'POPULARITY_DESC', label: 'Popular' },
  { value: 'SCORE_DESC', label: 'Top Rated' },
  { value: 'START_DATE_DESC', label: 'Newest' },
]

function SortChip({ label, active, onClick, container }) {
  const focus = useFocusable({ onSelect: onClick, region: 'catalog', container })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      className={`rounded-xl px-6 py-2.5 text-base font-bold border ${
        active ? 'tv-btn-primary border-transparent' : 'bg-white/[0.05] text-white/70 border-white/10 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Shared format-filtered browse grid powering the "TV Series" and "Movies"
 * sections — real AniList data via fetchBrowse's format filter.
 */
export default function TVCatalog({ format = 'TV', title = 'TV Series', icon: Icon = TvIcon }) {
  const [sort, setSort] = useState('TRENDING_DESC')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tv-catalog', format, sort, page],
    queryFn: () => fetchBrowse({ format: [format], sort, page, perPage: 24 }),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

  // Only claim BACK while an earlier page exists — an always-active handler
  // whose callback no-ops swallows the first remote-BACK press.
  useTVBackHandler(page > 1, () => setPage((p) => Math.max(1, p - 1)))

  const list = Array.isArray(data?.results) ? data.results : []
  const pageInfo = data?.pageInfo || {}
  const hasNext = Boolean(pageInfo.hasNextPage)
  const total = pageInfo.total || null

  // The whole browse grid is one focus container (mirrors the Home row pattern).
  // The first card is the deterministic navbar-RIGHT entry; LEFT from the page's
  // left edge returns to the matching navbar item.
  const contentId = format === 'MOVIE' ? 'catalog-movie' : 'catalog-tv'
  const navbarKey = format === 'MOVIE' ? 'navbar-movies' : 'navbar-tv-series'
  const firstCardKey = list[0] ? `${contentId}-${list[0].id}` : null
  const content = useFocusContainer({
    id: contentId,
    region: contentId,
    preferredChildKey: firstCardKey,
    exits: { left: navbarKey },
  })
  const sortChips = (withContainer) => (
    <div className="ml-auto flex items-center gap-3">
      {SORTS.map((s) => (
        <SortChip
          key={s.value}
          label={s.label}
          active={sort === s.value}
          onClick={() => { setSort(s.value); setPage(1) }}
          container={withContainer ? contentId : undefined}
        />
      ))}
    </div>
  )

  return (
    <div ref={content.ref} className="pb-20 pt-8 tv-enter">
      <TVContainerContext.Provider value={contentId}>
      <TVRegionContext.Provider value={contentId}>
      <div className="px-16 mb-7 flex items-center gap-4 flex-wrap">
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(99,102,241,0.28))' }}>
          <Icon className="w-8 h-8 text-cyan-300" />
        </span>
        <div>
          <h1 className="text-3xl font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>{title}</h1>
          <p className="text-sm text-white/45 mt-0.5">
            {total ? `${total.toLocaleString()} titles` : 'Browse the full catalog'}
          </p>
        </div>
        {sortChips(true)}
      </div>

      {isError ? (
        <TVErrorState message="Couldn't load this catalog." onRetry={refetch} />
      ) : isLoading ? (
            <div className="grid gap-y-9 px-16" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--kx-card-w, 184px), 1fr))', columnGap: 'var(--kx-card-gap, 18px)' }}>
          {Array.from({ length: 15 }, (_, i) => (
            <div key={i} className="tv-skeleton w-full aspect-[2/3]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <TVErrorState message="Nothing found here yet." />
      ) : (
        <>
            <div key={`${format}-${sort}-${page}`} className="grid gap-y-9 px-16" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--kx-card-w, 184px), 1fr))', columnGap: 'var(--kx-card-gap, 18px)' }}>
            {list.map((a, i) => (
              <TVAnimeCard key={a.id} anime={a} autoFocus={i === 0} />
            ))}
          </div>
          {(page > 1 || hasNext) && (
            <div className="px-16 mt-12 flex items-center justify-center gap-5">
              {page > 1 && (
                <TVButton variant="ghost" icon={ArrowLeft} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </TVButton>
              )}
              {hasNext && (
                <TVButton onClick={() => setPage((p) => p + 1)}>
                  Next Page
                </TVButton>
              )}
            </div>
          )}
        </>
      )}
      </TVRegionContext.Provider>
      </TVContainerContext.Provider>
    </div>
  )
}
