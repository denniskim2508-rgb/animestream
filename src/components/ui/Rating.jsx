import { Star } from 'lucide-react'

export default function Rating({ value, max = 10, size = 'sm' }) {
  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-1.5',
    lg: 'text-base gap-2',
  }

  const iconSizes = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' }

  let color = 'text-yellow-400'
  if (value >= 9) color = 'text-green-400'
  else if (value >= 8) color = 'text-yellow-400'
  else if (value >= 7) color = 'text-orange-400'
  else color = 'text-gray-400'

  return (
    <div className={`inline-flex items-center ${sizeClasses[size]}`}>
      <Star className={`${iconSizes[size]} ${color} fill-current`} />
      <span className={`font-bold ${color}`}>{value}</span>
      <span className="text-gray-500">/ {max}</span>
    </div>
  )
}
