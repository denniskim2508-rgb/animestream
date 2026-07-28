import { useState, useEffect, useRef } from 'react'
import { collectionGroup, query, orderBy, onSnapshot, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { BADGES } from '../data/badges'
import { MessageCircle, ThumbsUp, Reply, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const PLACEHOLDER_AVATAR = 'https://ui-avatars.com/api/?name=User&background=6d28d9&color=fff&size=96'

function formatTime(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return d.toLocaleDateString()
}

function CommentCard({ c, onClick }) {
  const badge = c.badges?.[0] ? BADGES[c.badges[0]] : null

  return (
    <button
      onClick={() => onClick(c)}
      className="shrink-0 w-[300px] sm:w-[320px] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 rounded-xl p-4 transition-all text-left group"
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <img
          src={c.avatar || PLACEHOLDER_AVATAR}
          alt=""
          onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }}
          className="w-8 h-8 rounded-full border border-white/10 object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white truncate">{c.name}</span>
            {badge && <span title={badge.name} className="text-xs">{badge.icon}</span>}
          </div>
          <span className="text-[11px] text-gray-600">{formatTime(c.createdAt)}</span>
        </div>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed mb-3 line-clamp-3">{c.text}</p>

      {c.animeCover && (
        <div className="flex items-center gap-2.5 mb-2.5 bg-white/[0.03] rounded-lg p-2">
          <img
            src={c.animeCover}
            alt=""
            className="w-8 h-11 rounded object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{c.animeTitle || 'Unknown Anime'}</p>
            <p className="text-[10px] text-gray-500">Episode {c.episode}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {c.likes || 0}</span>
        <span className="flex items-center gap-1"><Reply className="w-3 h-3" /> {c.replyCount || 0}</span>
      </div>
    </button>
  )
}

export default function CommunityComments() {
  useAuth()
  const navigate = useNavigate()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(() => {
    try { return JSON.parse(localStorage.getItem('appSettings') || '{}').hideCommunityComments || false }
    catch { return false }
  })
  const [activeTab, setActiveTab] = useState('newest')
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  useEffect(() => {
    if (hidden) { setLoading(false); return }
    const q = query(collectionGroup(db, 'messages'), orderBy('createdAt', 'desc'), limit(30))
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [hidden])

  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  useEffect(() => { checkScroll() }, [comments])

  const scroll = (dir) => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
    setTimeout(checkScroll, 400)
  }

  const sorted = [...comments].sort((a, b) => {
    if (activeTab === 'liked') return (b.likes || 0) - (a.likes || 0)
    if (activeTab === 'top') return (b.likes || 0) - (a.likes || 0)
    return 0
  })

  const handleClick = (c) => {
    if (c.animeId && c.episode) {
      navigate(`/watch/${c.animeId}/${c.episode}?total=0`)
    }
  }

  const toggleHide = () => {
    const next = !hidden
    setHidden(next)
    try {
      const settings = JSON.parse(localStorage.getItem('appSettings') || '{}')
      settings.hideCommunityComments = next
      localStorage.setItem('appSettings', JSON.stringify(settings))
    } catch { /* silent */ }
  }

  if (loading || sorted.length === 0) return null

  return (
    <section className="relative group/section">
      <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary-light" /> Community Comments
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
            {[
              { key: 'newest', label: 'Newest' },
              { key: 'top', label: 'Top Comments' },
              { key: 'liked', label: 'Most Liked' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.key ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={toggleHide}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              hidden ? 'bg-primary/10 text-primary-light' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" /> Hide Comments
          </button>
        </div>
      </div>

      {!hidden && (
        <div className="relative">
          {canScrollLeft && (
            <button onClick={() => scroll('left')} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover/section:opacity-100 transition-opacity hover:bg-black/90">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {canScrollRight && (
            <button onClick={() => scroll('right')} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover/section:opacity-100 transition-opacity hover:bg-black/90">
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 pb-4"
          >
            {sorted.map((c) => (
              <CommentCard key={c.id} c={c} onClick={handleClick} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
