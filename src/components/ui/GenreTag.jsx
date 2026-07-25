import { getGenreColor, getGenreIcon } from '../../data/mockData'

export default function GenreTag({ genreId, genreName, size = 'sm' }) {
  const name = genreName || (genreId ? genreId.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()) : '')
  const color = getGenreColor(name)
  const icon = getGenreIcon(name)

  if (!name) return null

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  }

  return (
    <span
      className={`${sizeClasses[size]} rounded-full font-semibold uppercase tracking-wider inline-flex items-center gap-1`}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}30`,
      }}
    >
      <span>{icon}</span>
      {name}
    </span>
  )
}
