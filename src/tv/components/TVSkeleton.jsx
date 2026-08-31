export function TVCardSkeleton({ landscape = false }) {
  return (
    <div className={`tv-skeleton shrink-0 ${landscape ? 'w-[360px] h-[203px]' : 'w-[210px] h-[340px]'}`} />
  )
}

export function TVRowSkeleton({ landscape = false }) {
  return (
    <section className="mb-10">
      <div className="tv-skeleton h-8 w-64 mx-16 mb-4" />
      <div className="flex gap-5 px-16 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <TVCardSkeleton key={i} landscape={landscape} />
        ))}
      </div>
    </section>
  )
}

export default function TVHomeSkeleton() {
  return (
    <div className="pt-4">
      <div className="tv-skeleton w-[92%] h-[52vh] mx-8 mb-10" />
      <TVRowSkeleton />
      <TVRowSkeleton />
    </div>
  )
}
