import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export default function ShowMore({ text = '', lines = 4, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  const [needsToggle, setNeedsToggle] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const fullHeight = el.scrollHeight
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const clampedHeight = lineHeight * lines
    setNeedsToggle(fullHeight > clampedHeight + 2)
  }, [text, lines])

  return (
    <div className={className}>
      <div
        ref={ref}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : lines,
          WebkitBoxOrient: 'vertical',
          lineHeight: '1.75',
        }}
      >
        {text}
      </div>
      {needsToggle && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 mt-2 text-sm font-semibold text-primary-light hover:text-primary transition-colors"
        >
          {expanded ? 'Show Less' : 'Show More'}
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}
