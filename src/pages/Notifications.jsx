import { Link, Navigate } from 'react-router-dom'
import { Bell, CheckCheck, Trash2, Film, Tv, Heart, Star, Info, ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const TYPE_CONFIG = {
  welcome: { icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  episode: { icon: Tv, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  favorite: { icon: Heart, color: 'text-red-400', bg: 'bg-red-500/10' },
  info: { icon: Info, color: 'text-primary-light', bg: 'bg-primary/10' },
}

function formatTime(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export default function Notifications() {
  const { user, notifications, unreadCount, markRead, markAllRead, clearAll } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/home"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Notifications
            {unreadCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-anime-red text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </h1>
        </div>
        {notifications.length > 0 && (
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </button>
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Bell className="w-10 h-10 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-400 mb-2">No notifications yet</h2>
          <p className="text-sm text-gray-600 mb-6">When you favorite anime or new episodes drop, you'll see updates here.</p>
          <Link
            to="/browse"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-full transition-all"
          >
            <Film className="w-4 h-4" /> Browse Anime
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info
            const Icon = config.icon
            const content = (
              <div
                className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                  notif.read
                    ? 'bg-white/[0.02] border-white/5'
                    : 'bg-white/[0.05] border-white/10'
                }`}
              >
                <div className={`shrink-0 w-10 h-10 rounded-full ${config.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className={`text-sm font-semibold ${notif.read ? 'text-gray-400' : 'text-white'}`}>
                      {notif.title}
                    </h3>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className={`text-sm leading-relaxed ${notif.read ? 'text-gray-600' : 'text-gray-400'}`}>
                    {notif.body}
                  </p>
                  <span className="text-[11px] text-gray-600 mt-1 block">
                    {formatTime(notif.createdAt)}
                  </span>
                </div>
                {!notif.read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markRead(notif.id) }}
                    className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                    title="Mark as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
              </div>
            )

            return notif.link ? (
              <Link key={notif.id} to={notif.link} className="block hover:opacity-80 transition-opacity">
                {content}
              </Link>
            ) : (
              <div key={notif.id}>{content}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
