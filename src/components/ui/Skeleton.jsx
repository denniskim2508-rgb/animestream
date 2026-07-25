export function SkeletonCard() {
  return (
    <div className="w-[160px] sm:w-[200px] shrink-0">
      <div className="aspect-[3/4] rounded-xl skeleton" />
      <div className="mt-2 px-1 space-y-2">
        <div className="h-4 rounded skeleton w-3/4" />
        <div className="h-3 rounded skeleton w-1/2" />
      </div>
    </div>
  )
}

export function SkeletonBanner() {
  return (
    <div className="w-full h-[70vh] min-h-[500px] skeleton" />
  )
}

export function SkeletonCarousel() {
  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="h-6 rounded skeleton w-48 mb-4" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <SkeletonBanner />
      <div className="max-w-[1440px] mx-auto space-y-12 -mt-20 relative z-10">
        <SkeletonCarousel />
        <SkeletonCarousel />
        <SkeletonCarousel />
      </div>
    </div>
  )
}
