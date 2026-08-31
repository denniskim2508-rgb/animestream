import { useEffect, useMemo, useState } from 'react'

function formatRemaining(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  const pad = (v) => String(v).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`
}

function useAiringCountdown(timeUntilAiring) {
  const target = useMemo(
    () => (typeof timeUntilAiring === 'number' ? Math.floor(Date.now() / 1000) + timeUntilAiring : null),
    [timeUntilAiring],
  )
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!target) return undefined
    let id
    const tick = () => {
      setNow(Date.now())
      const remaining = target - Date.now() / 1000
      id = setTimeout(tick, remaining > 3600 ? 30000 : 1000)
    }
    tick()
    return () => clearTimeout(id)
  }, [target])

  if (!target) return null
  const remaining = target - now / 1000
  if (remaining <= 0) return 'now'
  return formatRemaining(remaining)
}

export default function AiringCountdown({ airing, className = '' }) {
  const label = useAiringCountdown(airing?.timeUntilAiring)
  if (!label || !airing?.episode) return null
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-emerald-400/10 border border-emerald-400/25 px-3 py-0.5 text-sm font-bold text-emerald-300 tabular-nums ${className}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      EP {airing.episode} · {label}
    </span>
  )
}
