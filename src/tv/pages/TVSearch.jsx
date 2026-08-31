import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Globe, Delete, Star, CalendarClock } from 'lucide-react'
import { searchAnime } from '../../api/anilist'
import { useFocusable, useTVFocus } from '../TVFocusManager'

const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

const STATUS_LABELS = {
  RELEASING: 'Airing',
  FINISHED: 'Finished',
  NOT_YET_RELEASED: 'Not Yet Aired',
  CANCELLED: 'Cancelled',
  HIATUS: 'On Hiatus',
}

function formatRemaining(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}`
  if (h > 0) return `${h}h ${m}m`
  const pad = (v) => String(v).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`
}

function useCountdown(timeUntilAiring) {
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
  return remaining <= 0 ? 'now' : formatRemaining(remaining)
}

function Key({ children, label, onClick, wide = false, primary = false, focusKey = null, autoFocus = false, exit = null }) {
  const focus = useFocusable({ onSelect: onClick, region: 'keyboard', focusKey, autoFocus, exit })
  return (
    <button
      ref={focus.ref}
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`tv-card shrink-0 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${
        wide ? 'px-8' : ''
      }`}
      style={{
        minWidth: wide ? undefined : '68px',
        height: '58px',
        fontSize: wide ? undefined : '20px',
        padding: wide ? undefined : '0',
        ...(primary
          ? {
              background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary-dark))',
              color: '#fff',
            }
          : {}),
        ...(wide ? { paddingLeft: '28px', paddingRight: '28px' } : {}),
      }}
    >
      {children}
    </button>
  )
}

function UpcomingNote({ airing }) {
  const label = useCountdown(airing?.timeUntilAiring)
  if (!airing?.episode || !label) return null
  return (
    <div
      className="mt-auto inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-sm font-semibold"
      style={{
        borderColor: 'rgba(99, 102, 241, 0.45)',
        background: 'rgba(99, 102, 241, 0.14)',
        color: '#a5b4fc',
      }}
    >
      <CalendarClock className="w-4 h-4 shrink-0" />
      <span>{`Episode ${airing.episode}`}</span>
      <span className="text-white/40">·</span>
      <span className="tabular-nums">{label === 'now' ? 'Airing now' : `Coming in ${label}`}</span>
    </div>
  )
}

function ResultCard({ anime }) {
  const navigate = useNavigate()
  const ctx = useTVFocus()

  const focusNearestKeyboardKey = () => {
    const kb = document.getElementById('tv-search-keyboard')
    const el = focusRef?.current
    if (!ctx?.applyFocus || !kb || !el) return false
    let bottomRow = []
    let maxBottom = -Infinity
    kb.querySelectorAll('[data-tv-id]').forEach((key) => {
      const r = key.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      if (r.bottom > maxBottom + 4) { maxBottom = r.bottom; bottomRow = [key] }
      else if (r.bottom >= maxBottom - 4) bottomRow.push(key)
    })
    if (!bottomRow.length) return false
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    let best = bottomRow[0]
    let bestDist = Infinity
    for (const key of bottomRow) {
      const r = key.getBoundingClientRect()
      const d = Math.abs(r.left + r.width / 2 - cx)
      if (d < bestDist) { bestDist = d; best = key }
    }
    ctx.applyFocus(best.getAttribute('data-tv-id'))
    return true
  }

  // UP from the FIRST results row returns to the on-screen keyboard (nearest
  // key of its bottom row). Deeper rows keep moving inside the grid.
  const onArrowUpToKeyboard = (dir) => {
    if (dir !== 'up') return false
    const grid = document.getElementById('tv-search-results')
    const el = focusRef?.current
    if (!grid || !el) return false
    const cardRect = el.getBoundingClientRect()
    if (cardRect.top > grid.getBoundingClientRect().top + 8) return false
    return focusNearestKeyboardKey()
  }

  // BACK while browsing results closes the "results layer" hierarchically:
  // focus returns to the keyboard instead of leaving the Search page.
  const onBackToKeyboard = () => focusNearestKeyboardKey()

  const focus = useFocusable({ onSelect: () => navigate(`/tv/anime/${anime.id}`), onArrow: onArrowUpToKeyboard, onBack: onBackToKeyboard, region: 'results' })
  const focusRef = focus.ref
  const [imgOk, setImgOk] = useState(true)

  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => navigate(`/tv/anime/${anime.id}`)}
      className="tv-card relative rounded-2xl overflow-hidden flex text-left w-full"
      style={{ minHeight: '190px' }}
    >
      <div className="w-[150px] shrink-0 bg-black/40">
        {imgOk && anime.coverImage ? (
          <img
            src={anime.coverImage}
            alt={anime.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgOk(false)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/15 bg-white/[0.03]">
            KX
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 p-5 flex flex-col gap-1.5">
        <h3 className="text-white font-bold leading-snug line-clamp-2" style={{ fontSize: '21px' }}>
          {anime.title}
        </h3>

        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[15px] text-white/65 font-medium">
          {anime.format && (
            <span className="uppercase tracking-wide">{String(anime.format)}</span>
          )}
          {anime.episodes ? <span>{anime.episodes} EP</span> : null}
          {typeof anime.rating === 'number' && anime.rating > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-yellow-400">
              <Star className="w-4 h-4 fill-yellow-400" />
              {(Math.round(anime.rating * 10) / 10).toFixed(1)}
            </span>
          )}
          {anime.releaseYear ? <span>{anime.releaseYear}</span> : null}
        </div>

        <div className="text-[15px] text-white/45 font-medium">
          {[
            anime.season ? String(anime.season).charAt(0) + String(anime.season).slice(1).toLowerCase() : null,
            STATUS_LABELS[anime.status] || null,
          ].filter(Boolean).join(' · ') || '\u00A0'}
        </div>

        <UpcomingNote airing={anime.nextAiringEpisode} />
      </div>
    </button>
  )
}

export default function TVSearch() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const caretRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  // Physical keyboard support (USB keyboards / remote keyboards).
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Backspace') {
        setQuery((q) => q.slice(0, -1))
        return
      }
      if (e.key.length === 1 && /[a-zA-Z0-9 ]/.test(e.key)) {
        setQuery((q) => (q + e.key).slice(0, 60))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tv-search', debounced],
    queryFn: () => searchAnime(debounced, 1, 24),
    enabled: debounced.length >= 2,
    staleTime: 60 * 1000,
  })

  const results = data?.results || []
  const showResultsBlock = debounced.length >= 2

  return (
    <div className="px-16 py-8 pb-20 tv-enter">
      {/* ── Heading ── */}
      <h1
        className="text-5xl font-black mb-7"
        style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em' }}
      >
        Search
      </h1>

      {/* ── Search input ── */}
      <div
        className="flex items-center gap-4 rounded-2xl px-6 mb-8"
        style={{
          height: '84px',
          background: 'rgba(255,255,255,0.045)',
          border: '2px solid rgba(139,92,246,0.55)',
          boxShadow: '0 0 0 1px rgba(139,92,246,0.18), 0 8px 32px rgba(139,92,246,0.12)',
        }}
      >
        <Search className="w-7 h-7 shrink-0" style={{ color: '#a78bfa' }} />
        <span className="text-white font-semibold truncate" style={{ fontSize: '26px' }}>
          {query || <span className="text-white/30 font-normal">Type to search…</span>}
        </span>
        <span ref={caretRef} className="animate-pulse font-light" style={{ color: '#a78bfa', fontSize: '28px' }}>
          |
        </span>
      </div>

      {/* ── On-screen keyboard ── */}
      <div id="tv-search-keyboard" className="flex flex-col items-start gap-2.5 mb-10">
        <div className="flex gap-2.5">
          {NUMBER_ROW.map((k) => (
            <Key
              key={k}
              label={`digit ${k}`}
              onClick={() => setQuery((q) => (q + k).slice(0, 60))}
              // The first key is the page's deterministic entry: navbar
              // RIGHT -> search-key-1, and LEFT from it returns to the navbar.
              focusKey={k === '1' ? 'search-key-1' : null}
              autoFocus={k === '1'}
              exit={k === '1' ? { left: 'navbar-search' } : null}
            >
              {k}
            </Key>
          ))}
        </div>
        {LETTER_ROWS.map((row) => (
          <div key={row[0]} className="flex gap-2.5">
            {row.map((k) => (
              <Key key={k} label={`letter ${k}`} onClick={() => setQuery((q) => (q + k).slice(0, 60))}>
                {k}
              </Key>
            ))}
          </div>
        ))}

        {/* Action row: language · space · backspace · SEARCH */}
        <div className="flex gap-2.5 mt-1">
          <Key label="language" onClick={() => {}}>
            <Globe className="w-6 h-6 text-white/80" />
          </Key>
          <Key label="space" wide onClick={() => setQuery((q) => (q + ' ').slice(0, 60))}>
            <span className="text-white/80 text-lg tracking-widest">SPACE</span>
          </Key>
          <Key label="backspace" wide onClick={() => setQuery((q) => q.slice(0, -1))}>
            <Delete className="w-6 h-6 text-white/80" />
          </Key>
          <Key label="search" wide primary onClick={() => setDebounced(query.trim())}>
            <Search className="w-5 h-5 fill-white" />
            SEARCH
          </Key>
        </div>
      </div>

      {/* ── Results ── */}
      {showResultsBlock && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <h2
              className="text-3xl font-bold"
              style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em' }}
            >
              Results
            </h2>
            {!isLoading && !isError && results.length > 0 && (
              <span className="text-sm font-semibold text-white/40 bg-white/[0.06] border border-white/10 rounded-full px-3 py-0.5">
                {results.length}
              </span>
            )}
          </div>

          {isLoading && (
            <div className="grid grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="tv-skeleton w-full h-[190px]" />
              ))}
            </div>
          )}

          {!isLoading && isError && (
            <p className="text-lg text-red-400">Search failed. Please try again.</p>
          )}

          {!isLoading && !isError && results.length === 0 && (
            <p className="text-lg text-white/50">No results for “{debounced}”.</p>
          )}

          {!isLoading && !isError && results.length > 0 && (
            <div id="tv-search-results" className="grid grid-cols-2 gap-5 max-w-[1500px]">
              {results.map((a) => (
                <ResultCard key={a.id} anime={a} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
