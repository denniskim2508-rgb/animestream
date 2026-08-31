import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchByGenre, ANILIST_GENRES } from '../../api/anilist'
import TVAnimeCard from '../components/TVAnimeCard'
import TVErrorState from '../components/TVErrorState'
import { useFocusable } from '../TVFocusManager'

const PAGE_SIZE = 20

function GenreChip({ genre, active, onSelect }) {
  const focus = useFocusable({ onSelect })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onSelect}
      className={`shrink-0 rounded-xl px-6 py-3 text-lg font-semibold border ${
        active
          ? 'bg-[var(--color-primary)] text-white border-transparent'
          : 'bg-white/5 text-white/75 border-white/10'
      }`}
    >
      {genre}
    </button>
  )
}

export default function TVBrowse() {
  const [genre, setGenre] = useState(ANILIST_GENRES[0])
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tv-browse', genre, page],
    queryFn: () => fetchByGenre(genre, page, PAGE_SIZE),
    staleTime: 5 * 60 * 1000,
  })

  const items = data?.results || []
  const hasNext = Boolean(data?.pageInfo?.hasNextPage)

  const goGenre = (g) => {
    setGenre(g)
    setPage(1)
  }

  return (
    <div className="px-16 py-8 pb-16">
      <h1 className="text-3xl font-black mb-6">Browse by Genre</h1>
      <div className="tv-row-scroll flex gap-3 overflow-x-auto pb-2 mb-8">
        {ANILIST_GENRES.map((g) => (
          <GenreChip key={g} genre={g} active={g === genre} onSelect={() => goGenre(g)} />
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--kx-card-w, 184px), 1fr))', columnGap: 'var(--kx-card-gap, 18px)' }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="tv-skeleton w-full h-[340px]" />
          ))}
        </div>
      ) : isError ? (
        <TVErrorState onRetry={refetch} />
      ) : (
        <>
          <div className="grid gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--kx-card-w, 184px), 1fr))', columnGap: 'var(--kx-card-gap, 18px)' }}>
            {items.map((a) => (
              <TVAnimeCard key={a.id} anime={a} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 mt-10">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl bg-white/10 border border-white/25 px-7 py-4 text-lg font-semibold disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-lg text-white/60">Page {page}</span>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl bg-white/10 border border-white/25 px-7 py-4 text-lg font-semibold disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
