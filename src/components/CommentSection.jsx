import { useState, useEffect, useRef, useCallback } from 'react'
import {
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp,
  doc, updateDoc, deleteDoc, getDoc, increment, limit,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { BADGES, checkBadges } from '../data/badges'
import {
  MessageCircle, Send, Loader2, SmilePlus, ThumbsUp, ThumbsDown,
  Reply, MoreHorizontal, Pin, AlertTriangle, ChevronDown, ChevronUp, Trash2, Flag,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const PLACEHOLDER_AVATAR = 'https://ui-avatars.com/api/?name=User&background=6d28d9&color=fff&size=96'

// Client-side spam guard: comments and replies share a per-session cooldown.
// Server enforcement is handled by firestore.rules (auth + field whitelist).
const COMMENT_COOLDOWN_MS = 15_000
let lastCommentAt = 0
const remainingCooldownMs = () => Math.max(0, lastCommentAt + COMMENT_COOLDOWN_MS - Date.now())

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','🥳','😏','😅','😉','😌','😴','🤗','🤭','🤫','🤔','😐','😑','😶','🙄','😬','😮‍💨','😔','😪','🤤','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','🤓','🧐'],
  'Reactions': ['❤️','🔥','💯','✨','⭐','🌟','💪','👏','🙌','👍','👎','✌️','🤝','🙏','💕','💖','💗','💜','💙','💚','🧡','🖤','🤍','💔','❣️','💞','💓','🎉','🎊','🏆','🥇','🎯','💥','💫','🌈'],
  'Anime': ['⚡','🗡️','🛡️','⚔️','🏴','🎌','🌸','🌺','🍃','🌙','☀️','💧','🌊','🌪️','❄️','☠️','👻','👹','👺','💀','👁️','🧠','🩸','🌀','🔮','🪄','🏹','📜','🗝️','🐉','🦎','🍿','🍜','🍣','🍡','🍵'],
}

function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('Smileys')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [onClose])

  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-2 w-[280px] sm:w-[320px] bg-gray-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
      <div className="flex gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-hide">
        {Object.keys(EMOJI_CATEGORIES).map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-2 py-1 text-[10px] font-medium rounded-lg whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-primary text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            {cat}
          </button>
        ))}
      </div>
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-[180px] overflow-y-auto">
        {(EMOJI_CATEGORIES[activeCategory] || []).map((emoji, i) => (
          <button key={`${emoji}-${i}`} onClick={() => onSelect(emoji)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-base">
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function BadgeDisplay({ badgeIds }) {
  if (!badgeIds?.length) return null
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {badgeIds.slice(0, 3).map((id) => {
        const b = BADGES[id]
        return b ? <span key={id} title={b.name} className="text-xs">{b.icon}</span> : null
      })}
      {badgeIds.length > 3 && <span className="text-[10px] text-gray-500">+{badgeIds.length - 3}</span>}
    </span>
  )
}

function SpoilerBlock({ children, containsSpoiler }) {
  const [revealed, setRevealed] = useState(false)
  if (!containsSpoiler || revealed) return children
  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 my-2">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-semibold text-yellow-300">Spoiler</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">This comment contains spoilers.</p>
      <button onClick={() => setRevealed(true)} className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 text-xs font-semibold rounded-lg transition-colors">
        Show Comment
      </button>
    </div>
  )
}

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

function ReplyItem({ reply, user, episodePath }) {
  const [showMore, setShowMore] = useState(false)
  const myLike = user && reply.likedBy?.[user.uid]
  const myDislike = user && reply.dislikedBy?.[user.uid]
  const likeCount = reply.likes || 0
  const dislikeCount = reply.dislikes || 0

  const handleReaction = async (type) => {
    if (!user) return
    const ref = doc(db, episodePath, reply.id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const data = snap.data()
    const updates = {}
    if (type === 'like') {
      if (data.likedBy?.[user.uid]) {
        updates.likes = increment(-1)
        updates.likedBy = { ...data.likedBy }
        delete updates.likedBy[user.uid]
      } else {
        updates.likes = increment(1)
        updates.likedBy = { ...data.likedBy, [user.uid]: true }
        if (data.dislikedBy?.[user.uid]) {
          updates.dislikes = increment(-1)
          updates.dislikedBy = { ...data.dislikedBy }
          delete updates.dislikedBy[user.uid]
        }
      }
    } else {
      if (data.dislikedBy?.[user.uid]) {
        updates.dislikes = increment(-1)
        updates.dislikedBy = { ...data.dislikedBy }
        delete updates.dislikedBy[user.uid]
      } else {
        updates.dislikes = increment(1)
        updates.dislikedBy = { ...data.dislikedBy, [user.uid]: true }
        if (data.likedBy?.[user.uid]) {
          updates.likes = increment(-1)
          updates.likedBy = { ...data.likedBy }
          delete updates.likedBy[user.uid]
        }
      }
    }
    await updateDoc(ref, updates)
  }

  return (
    <div className="flex gap-2.5 py-3">
      <img src={reply.avatar || PLACEHOLDER_AVATAR} alt="" onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {reply.uid ? <Link to="/profile" className="text-xs font-semibold text-white hover:text-primary-light transition-colors">{reply.name}</Link> : <span className="text-xs font-semibold text-white">{reply.name}</span>}
          <BadgeDisplay badgeIds={reply.badges} />
          <span className="text-[10px] text-gray-600">{formatTime(reply.createdAt)}</span>
        </div>
        <SpoilerBlock containsSpoiler={reply.containsSpoiler}>
          <p className="text-xs text-gray-300 leading-relaxed mt-0.5">{reply.text}</p>
        </SpoilerBlock>
        <div className="flex items-center gap-3 mt-1.5">
          <button onClick={() => handleReaction('like')} className={`flex items-center gap-1 text-[11px] transition-colors ${myLike ? 'text-primary-light' : 'text-gray-500 hover:text-gray-300'}`}>
            <ThumbsUp className="w-3 h-3" /> {likeCount || ''}
          </button>
          <button onClick={() => handleReaction('dislike')} className={`flex items-center gap-1 text-[11px] transition-colors ${myDislike ? 'text-red-400' : 'text-gray-500 hover:text-gray-300'}`}>
            <ThumbsDown className="w-3 h-3" /> {dislikeCount || ''}
          </button>
          {user?.uid === reply.uid && (
            <div className="relative">
              <button onClick={() => setShowMore(!showMore)} className="text-gray-600 hover:text-gray-400"><MoreHorizontal className="w-3 h-3" /></button>
              {showMore && (
                <button onClick={async () => { await deleteDoc(doc(db, episodePath, reply.id)); setShowMore(false) }} className="absolute top-0 left-6 bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-red-400 hover:bg-gray-700 whitespace-nowrap z-10 flex items-center gap-1">
                  <Trash2 className="w-2.5 h-2.5" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CommentItem({ c, user, animeId, episode, onPin, pinnedId, hideSpoilers }) {
  const [showReplies, setShowReplies] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replySpoiler, setReplySpoiler] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [replyCooldownMs, setReplyCooldownMs] = useState(0)
  const [replyError, setReplyError] = useState('')
  const [replies, setReplies] = useState([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [revealedSpoilers, setRevealedSpoilers] = useState(false)

  const myLike = user && c.likedBy?.[user.uid]
  const myDislike = user && c.dislikedBy?.[user.uid]
  const likeCount = c.likes || 0
  const dislikeCount = c.dislikes || 0
  const isOwner = user?.uid === c.uid
  const isPinned = pinnedId === c.id
  const episodePath = `comments/${animeId}/episodes/${episode}/messages/${c.id}/replies`

  const loadReplies = useCallback(() => {
    if (repliesLoaded) return
    const q = query(collection(db, episodePath), orderBy('createdAt', 'asc'), limit(20))
    onSnapshot(q, (snap) => {
      setReplies(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setRepliesLoaded(true)
    })
  }, [episodePath, repliesLoaded])

  const handleReaction = async (type) => {
    if (!user) return
    const ref = doc(db, `comments/${animeId}/episodes/${episode}/messages`, c.id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const data = snap.data()
    const updates = {}
    if (type === 'like') {
      if (data.likedBy?.[user.uid]) {
        updates.likes = increment(-1)
        const newMap = { ...data.likedBy }
        delete newMap[user.uid]
        updates.likedBy = newMap
      } else {
        updates.likes = increment(1)
        updates.likedBy = { ...data.likedBy, [user.uid]: true }
        if (data.dislikedBy?.[user.uid]) {
          updates.dislikes = increment(-1)
          const newMap = { ...data.dislikedBy }
          delete newMap[user.uid]
          updates.dislikedBy = newMap
        }
      }
    } else {
      if (data.dislikedBy?.[user.uid]) {
        updates.dislikes = increment(-1)
        const newMap = { ...data.dislikedBy }
        delete newMap[user.uid]
        updates.dislikedBy = newMap
      } else {
        updates.dislikes = increment(1)
        updates.dislikedBy = { ...data.dislikedBy, [user.uid]: true }
        if (data.likedBy?.[user.uid]) {
          updates.likes = increment(-1)
          const newMap = { ...data.likedBy }
          delete newMap[user.uid]
          updates.likedBy = newMap
        }
      }
    }
    await updateDoc(ref, updates)
  }

  const handleReply = async (e) => {
    e.preventDefault()
    const trimmed = replyText.trim()
    if (!trimmed || !user) return
    const waitMs = remainingCooldownMs()
    if (waitMs > 0) {
      setReplyCooldownMs(waitMs)
      return
    }
    setSendingReply(true)
    setReplyError('')
    try {
      await addDoc(collection(db, episodePath), {
        name: user.name, avatar: user.avatar || '', uid: user.uid,
        text: trimmed, createdAt: serverTimestamp(),
        likes: 0, dislikes: 0, likedBy: {}, dislikedBy: {},
        containsSpoiler: replySpoiler, badges: user.badges || [],
      })
      lastCommentAt = Date.now()
      setReplyText('')
      setReplySpoiler(false)
      setShowReplies(true)
    } catch {
      setReplyError("Couldn't post your reply. Please try again.")
    }
    setSendingReply(false)
    if (c.uid && c.uid !== user.uid) {
      try {
        await addDoc(collection(db, 'users', c.uid, 'notifications'), {
          title: `${user.name} replied to your comment`,
          body: trimmed.slice(0, 100),
          type: 'reply', animeId: String(animeId), episode: Number(episode),
          sender: user.name, senderAvatar: user.avatar || '',
          commentId: c.id, read: false, createdAt: serverTimestamp(),
        })
      } catch { /* notification is best-effort, non-fatal */ }
    }
  }

  return (
    <div className={`rounded-xl border px-4 py-3.5 transition-colors ${isPinned ? 'bg-primary/5 border-primary/20' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'}`}>
      {isPinned && (
        <div className="flex items-center gap-1.5 mb-2 text-primary-light">
          <Pin className="w-3 h-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Pinned</span>
        </div>
      )}
      <div className="flex items-start gap-3">
        {c.uid ? (
          <Link to="/profile" className="shrink-0">
            <img src={c.avatar || PLACEHOLDER_AVATAR} alt="" onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }} className="w-9 h-9 rounded-full border border-white/10 shadow-md object-cover hover:ring-2 hover:ring-primary/50 transition-all" />
          </Link>
        ) : (
          <img src={c.avatar || PLACEHOLDER_AVATAR} alt="" onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }} className="w-9 h-9 rounded-full border border-white/10 shadow-md object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {c.uid ? <Link to="/profile" className="text-sm font-semibold text-white hover:text-primary-light transition-colors">{c.name}</Link> : <span className="text-sm font-semibold text-white">{c.name}</span>}
            <BadgeDisplay badgeIds={c.badges} />
            <span className="text-[11px] text-gray-600">{formatTime(c.createdAt)}</span>
          </div>

          {c.containsSpoiler && !revealedSpoilers && !isOwner ? (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 my-1">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-300">Spoiler</span>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">This comment contains spoilers.</p>
              <button onClick={() => setRevealedSpoilers(true)} className="px-3 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 text-xs font-semibold rounded-lg transition-colors">
                {hideSpoilers ? 'Show Comment' : 'Reveal'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-300 leading-relaxed">{c.text}</p>
          )}

          <div className="flex items-center gap-1 mt-2 -ml-1">
            <button onClick={() => handleReaction('like')} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${myLike ? 'bg-primary/10 text-primary-light' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
              <ThumbsUp className="w-3.5 h-3.5" /> {likeCount > 0 ? likeCount : ''}
            </button>
            <button onClick={() => handleReaction('dislike')} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${myDislike ? 'bg-red-500/10 text-red-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
              <ThumbsDown className="w-3.5 h-3.5" /> {dislikeCount > 0 ? dislikeCount : ''}
            </button>
            {user && (
              <button onClick={() => { setShowReplies(!showReplies); if (!showReplies) loadReplies() }} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors">
                <Reply className="w-3.5 h-3.5" /> Reply
              </button>
            )}
            {isOwner && (
              <button onClick={() => onPin(c.id)} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${isPinned ? 'text-primary-light' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                <Pin className="w-3.5 h-3.5" /> {isPinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            <div className="relative ml-auto">
              <button onClick={() => setShowMore(!showMore)} className="p-1 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMore && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-lg shadow-xl z-20 overflow-hidden min-w-[120px]">
                  {isOwner && (
                    <button onClick={async () => { await deleteDoc(doc(db, `comments/${animeId}/episodes/${episode}/messages`, c.id)); setShowMore(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/5 transition-colors">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                  <button onClick={() => setShowMore(false)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-white/5 transition-colors">
                    <Flag className="w-3 h-3" /> Report
                  </button>
                </div>
              )}
            </div>
          </div>

          {showReplies && (
            <div className="mt-3 border-t border-white/5 pt-2">
              {repliesLoaded && replies.length > 0 && (
                <button onClick={() => setShowReplies(replies.length > 0 ? !showReplies : false)} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 mb-1 transition-colors">
                  {showReplies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </button>
              )}
              {showReplies && replies.map((r) => (
                <ReplyItem key={r.id} reply={r} user={user} episodePath={episodePath} />
              ))}
              <form onSubmit={handleReply} className="flex items-center gap-2 mt-2">
                <img src={user?.avatar || PLACEHOLDER_AVATAR} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                <input
                  type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..." maxLength={500}
                  className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button type="button" onClick={() => setReplySpoiler(!replySpoiler)} className={`p-1.5 rounded-lg transition-colors ${replySpoiler ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`} title="Contains spoilers">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </button>
                <button type="submit" disabled={sendingReply || replyText.trim().length < 2} className="p-1.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white rounded-lg transition-colors">
                  {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </form>
              {replyCooldownMs > 0 && (
                <p className="text-[11px] text-yellow-400 mt-1.5">Please wait {Math.ceil(replyCooldownMs / 1000)}s before posting again.</p>
              )}
              {replyError && (
                <p className="text-[11px] text-red-400 mt-1.5">{replyError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CommentSection({ animeId, episode, animeTitle, animeCover }) {
  const { user, addNotification } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [cooldownMs, setCooldownMs] = useState(0)
  const [postError, setPostError] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [containsSpoiler, setContainsSpoiler] = useState(false)
  const [pinnedId, setPinnedId] = useState(null)
  const inputRef = useRef(null)

  const messagesPath = `comments/${animeId}/episodes/${episode}/messages`
  const messagesRef = collection(db, messagesPath)
  const hideSpoilers = (() => { try { return JSON.parse(localStorage.getItem('appSettings') || '{}').hideSpoilers } catch { return false } })()

  useEffect(() => {
    setLoading(true)
    const q = query(messagesRef, orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const pinned = list.find((c) => c.pinned)
      setPinnedId(pinned?.id || null)
      setComments(list)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [animeId, episode])

  useEffect(() => {
    if (!user) return
    const checkAndUnlock = async () => {
      const userSnap = await getDoc(doc(db, 'users', user.uid))
      if (!userSnap.exists()) return
      const userData = userSnap.data()
      const { earned, newBadges } = checkBadges(userData, { commentsPosted: userData.commentsPosted || 0, likesReceived: userData.likesReceived || 0 })
      if (newBadges.length > 0) {
        await updateDoc(doc(db, 'users', user.uid), { badges: earned })
        for (const badgeId of newBadges) {
          const b = BADGES[badgeId]
          if (b) await addNotification(`Badge Unlocked: ${b.name} ${b.icon}`, b.description, 'badge', '/profile')
        }
      }
    }
    checkAndUnlock()
  }, [user?.uid])

  const handlePin = async (commentId) => {
    if (!user) return
    if (pinnedId === commentId) {
      await updateDoc(doc(db, messagesPath, commentId), { pinned: false, pinnedBy: null })
      setPinnedId(null)
    } else {
      if (pinnedId) await updateDoc(doc(db, messagesPath, pinnedId), { pinned: false, pinnedBy: null })
      await updateDoc(doc(db, messagesPath, commentId), { pinned: true, pinnedBy: user.uid })
      setPinnedId(commentId)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || trimmedText.length < 2 || trimmedText.length > 500) return
    if (!user?.name) return
    const waitMs = remainingCooldownMs()
    if (waitMs > 0) {
      setCooldownMs(waitMs)
      return
    }

    setSending(true)
    setPostError('')
    try {
      await addDoc(messagesRef, {
        name: user.name, avatar: user.avatar || '',
        uid: user.uid, text: trimmedText, createdAt: serverTimestamp(),
        likes: 0, dislikes: 0, likedBy: {}, dislikedBy: {},
        containsSpoiler,
        badges: user.badges || [],
        animeId: String(animeId), episode: Number(episode),
        animeTitle: animeTitle || '', animeCover: animeCover || '',
      })
      lastCommentAt = Date.now()
      setText('')
      setContainsSpoiler(false)
      const userSnap = await getDoc(doc(db, 'users', user.uid))
      if (userSnap.exists()) {
        const ud = userSnap.data()
        const commentsPosted = (ud.commentsPosted || 0) + 1
        await updateDoc(doc(db, 'users', user.uid), { commentsPosted })
        const { earned, newBadges } = checkBadges({ ...ud, commentsPosted }, { commentsPosted })
        if (newBadges.length > 0) {
          await updateDoc(doc(db, 'users', user.uid), { badges: earned })
          for (const badgeId of newBadges) {
            const b = BADGES[badgeId]
            if (b) await addNotification(`Badge Unlocked: ${b.name} ${b.icon}`, b.description, 'badge', '/profile')
          }
        }
      }
    } catch {
      setPostError("Couldn't post your comment. Please try again.")
    }
    setSending(false)
  }

  const insertEmoji = (emoji) => {
    setText((prev) => prev + emoji)
    setShowEmoji(false)
    inputRef.current?.focus()
  }

  const pinnedComment = comments.find((c) => c.id === pinnedId)
  const otherComments = comments.filter((c) => c.id !== pinnedId)

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-white">
          Comments <span className="text-gray-500 font-normal text-sm">({comments.length})</span>
        </h3>
      </div>

      {!user ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4">
          <MessageCircle className="w-5 h-5 text-gray-500 shrink-0" />
          <p className="text-sm text-gray-400">
            <Link to="/login" className="text-primary-light hover:underline font-medium">Log in</Link> to join the discussion.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3">
          <div className="flex gap-3 items-start">
            <img src={user.avatar || PLACEHOLDER_AVATAR} alt="" onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }} className="w-9 h-9 rounded-full border border-white/10 shadow-md object-cover shrink-0 mt-0.5" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-white">{user.name}</span>
                <BadgeDisplay badgeIds={user.badges} />
              </div>
              <div className="flex gap-2 items-center">
                <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment..." maxLength={500}
                  className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <div className="relative">
                  <button type="button" onClick={() => setShowEmoji(!showEmoji)} className={`p-2.5 rounded-xl transition-colors ${showEmoji ? 'bg-primary/20 text-primary-light' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} title="Emoji">
                    <SmilePlus className="w-5 h-5" />
                  </button>
                  {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
                </div>
                <button type="button" onClick={() => setContainsSpoiler(!containsSpoiler)} className={`p-2.5 rounded-xl transition-colors ${containsSpoiler ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} title="Contains spoilers">
                  <AlertTriangle className="w-5 h-5" />
                </button>
                <button type="submit" disabled={sending || text.trim().length < 2}
                  className="px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center gap-2">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-600">{text.length}/500</p>
            {containsSpoiler && <p className="text-[11px] text-yellow-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Marked as spoiler</p>}
          </div>
          {cooldownMs > 0 && (
            <p className="text-[11px] text-yellow-400">Please wait {Math.ceil(cooldownMs / 1000)}s before posting again.</p>
          )}
          {postError && (
            <p className="text-[11px] text-red-400">{postError}</p>
          )}
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>
      ) : comments.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-3">
          {pinnedComment && (
            <CommentItem c={pinnedComment} user={user} animeId={animeId} episode={episode} onPin={handlePin} pinnedId={pinnedId} hideSpoilers={hideSpoilers} />
          )}
          {otherComments.map((c) => (
            <CommentItem key={c.id} c={c} user={user} animeId={animeId} episode={episode} onPin={handlePin} pinnedId={pinnedId} hideSpoilers={hideSpoilers} />
          ))}
        </div>
      )}
    </div>
  )
}
