import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { MessageCircle, Send, Loader2, SmilePlus } from 'lucide-react'
import { Link } from 'react-router-dom'

const PLACEHOLDER_AVATAR = 'https://ui-avatars.com/api/?name=User&background=6d28d9&color=fff&size=96'

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','🥳','😏','😅','😉','😌','😴','🥱','🤗','🤭','🤫','🤔','😐','😑','😶','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Reactions': ['❤️','🔥','💯','✨','⭐','🌟','💪','👏','🙌','👍','👎','✌️','🤝','🙏','💕','💖','💗','💘','💝','💜','💙','💚','🧡','🖤','🤍','💔','❣️','💞','💓','💗','🎉','🎊','🏆','🥇','🎯','💥','💫','🌈'],
  'Anime': ['⚡','🗡️','🛡️','⚔️','🏴','🎌','🌸','🌺','🍃','🌙','☀️','🔥','💧','🌊','🌪️','❄️','☠️','👻','👹','👺','💀','🦷','👁️','🧠','💜','🩸','🌀','🔮','✨','🎆','🎇','🪄','🗡️','🏹','🔮','📜','🗝️','🍄','🐉','🦎'],
  'Food': ['🍵','🍶','🍜','🍙','🍣','🍡','🍱','🍘','🍥','🥠','🍚','🍘','🍢','🍡','🧁','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🍮','🍿','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🍸','🍹'],
  'Objects': ['🎮','🕹️','🎧','🎵','🎶','🎤','🎬','📺','📷','🔍','💻','⌨️','🖥️','📱','🔔','🔕','💬','💭','🗯️','📝','📌','📎','🔒','🔑','🗡️','🛡️'],
}

function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('Smileys')
  const ref = useRef(null)

  const handleClickOutside = useCallback((e) => {
    if (ref.current && !ref.current.contains(e.target)) onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [handleClickOutside])

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-2 w-[300px] sm:w-[340px] bg-gray-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
    >
      <div className="flex gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-hide">
        {Object.keys(EMOJI_CATEGORIES).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
        {(EMOJI_CATEGORIES[activeCategory] || []).map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onSelect(emoji)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-lg"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="px-2 pb-2 pt-1 border-t border-white/5">
        <p className="text-[10px] text-gray-600 text-center">Click an emoji to insert</p>
      </div>
    </div>
  )
}

export default function CommentSection({ animeId, episode }) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState(() => localStorage.getItem('comment_name') || '')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const inputRef = useRef(null)

  const messagesRef = collection(db, 'comments', String(animeId), 'episodes', String(episode), 'messages')

  useEffect(() => {
    setLoading(true)
    const q = query(messagesRef, orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => {
      setLoading(false)
    })
    return unsub
  }, [animeId, episode])

  const insertEmoji = (emoji) => {
    setText((prev) => prev + emoji)
    setShowEmoji(false)
    inputRef.current?.focus()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || trimmedText.length < 2 || trimmedText.length > 500) return

    const displayName = user?.name || name.trim()
    if (!displayName) return

    setSending(true)
    try {
      await addDoc(messagesRef, {
        name: displayName.slice(0, 30),
        avatar: user?.avatar || '',
        uid: user?.uid || '',
        text: trimmedText,
        createdAt: serverTimestamp(),
      })
      if (!user) localStorage.setItem('comment_name', displayName)
      setText('')
    } catch {
      // silent fail
    }
    setSending(false)
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = ts.toDate()
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 30) return `${diffDay}d ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-white">
          Comments <span className="text-gray-500 font-normal text-sm">({comments.length})</span>
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3">
        {!user && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={30}
            className="w-full sm:w-64 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        )}
        <div className="flex gap-3 items-start">
          {user && (
            <img
              src={user.avatar || PLACEHOLDER_AVATAR}
              alt={user.name}
              onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }}
              className="w-9 h-9 rounded-full border border-white/10 shadow-md object-cover shrink-0 mt-0.5"
            />
          )}
          <div className="flex-1 flex flex-col gap-2">
            {user && <span className="text-sm font-medium text-white">{user.name}</span>}
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a comment..."
                maxLength={500}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmoji(!showEmoji)}
                  className={`p-2.5 rounded-lg transition-colors ${
                    showEmoji
                      ? 'bg-primary/20 text-primary-light'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Emoji"
                >
                  <SmilePlus className="w-5 h-5" />
                </button>
                {showEmoji && (
                  <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />
                )}
              </div>
              <button
                type="submit"
                disabled={sending || text.trim().length < 2 || (!user && !name.trim())}
                className="px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-600">{text.length}/500</p>
      </form>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="bg-white/5 border border-white/5 rounded-xl px-4 py-3.5">
              <div className="flex items-start gap-3">
                {c.uid ? (
                  <Link to="/profile" className="shrink-0">
                    <img
                      src={c.avatar || PLACEHOLDER_AVATAR}
                      alt={c.name}
                      onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }}
                      className="w-10 h-10 rounded-full border border-white/10 shadow-md object-cover hover:ring-2 hover:ring-primary/50 transition-all"
                    />
                  </Link>
                ) : (
                  <img
                    src={c.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'U')}&background=6d28d9&color=fff&size=96`}
                    alt={c.name}
                    onError={(e) => { e.target.src = PLACEHOLDER_AVATAR }}
                    className="w-10 h-10 rounded-full border border-white/10 shadow-md object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">{c.name}</span>
                    <span className="text-[11px] text-gray-600">{formatTime(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{c.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
