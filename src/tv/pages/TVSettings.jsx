import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import {
  Play, User, Server, LayoutGrid, RefreshCw, Bell, AppWindow, Palette,
  Check, X, AlertTriangle, Clock, ShieldAlert, Loader2,
  ChevronRight, Info, FileText, Trash2, Eraser, ScrollText,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { loadVideoSettings, saveVideoSetting } from '../../utils/videoSettings'
import { saveAudioPreference } from '../../utils/videoSettings'
import { loadNotificationPrefs, saveNotificationPrefs } from '../../utils/notificationPrefs'
import { POSTER_SIZES, loadPosterSize, savePosterSize } from '../appearance'
import { API_BASE } from '../../api/base'
import { useFocusable, useTVScope, useTVBackHandler } from '../TVFocusManager'

const PROVIDER_NAMES = {
  mangadex: 'MangaDex',
  mangapill: 'MangaPill',
  allmanga: 'AllManga',
  asurascans: 'AsuraScans',
  atsu: 'Atsu',
  kitsu: 'Kitsu',
  anidap: 'AniDap',
  anilist: 'AniList',
  'media-proxy': 'Media Proxy',
}

const STATUS_META = {
  healthy: { color: '#34d399', label: 'Healthy' },
  degraded: { color: '#fbbf24', label: 'Slow / flaky' },
  rate_limited: { color: '#fb923c', label: 'Rate limited' },
  unhealthy: { color: '#f87171', label: 'Unhealthy' },
  server_error: { color: '#f87171', label: 'Server error' },
  forbidden: { color: '#f87171', label: 'Forbidden' },
  timeout: { color: '#f87171', label: 'Timed out' },
}
const statusMeta = (cls) => STATUS_META[cls] || { color: '#94a3b8', label: cls ? String(cls) : 'No data yet' }

const CATEGORIES = [
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'account', label: 'Account', icon: User },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'content', label: 'Content', icon: LayoutGrid },
  { id: 'listsync', label: 'List Sync', icon: RefreshCw },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'app', label: 'App', icon: AppWindow },
]

/* ── Building blocks ─────────────────────────────────────────────────────── */

function CategoryButton({ cat, selected, onSelect, focusKey = null, autoFocus = false, exit = null }) {
  const focus = useFocusable({ onSelect: () => onSelect(cat.id), region: 'categories', focusKey, autoFocus, exit })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => onSelect(cat.id)}
      data-selected={selected}
      className="tv-set-cat"
    >
      <cat.icon className="w-6 h-6 shrink-0" />
      {cat.label}
    </button>
  )
}

function ToggleRow({ title, desc, on, onChange, disabled = false }) {
  const focus = useFocusable({ onSelect: () => { if (!disabled) onChange(!on) }, disabled, region: 'panel' })
  if (disabled) {
    return (
      <div className="tv-set-row opacity-50">
        <span>
          <span className="tv-set-row-title block">{title}</span>
          {desc && <span className="tv-set-row-desc block">{desc}</span>}
        </span>
        <span className="tv-switch" data-on={Boolean(on)} data-disabled="true" />
      </div>
    )
  }
  return (
    <button ref={focus.ref} type="button" onClick={() => onChange(!on)} className="tv-set-row">
      <span>
        <span className="tv-set-row-title block">{title}</span>
        {desc && <span className="tv-set-row-desc block">{desc}</span>}
      </span>
      <span className="tv-switch" data-on={Boolean(on)} />
    </button>
  )
}

function DisabledRow({ title, desc }) {
  return (
    <div className="tv-set-row opacity-50">
      <span>
        <span className="tv-set-row-title block">{title}</span>
        {desc && <span className="tv-set-row-desc block">{desc}</span>}
      </span>
      <span className="tv-switch" data-on={false} data-disabled="true" />
    </div>
  )
}

function ActionRow({ title, desc, icon: Icon, danger = false, onClick }) {
  const focus = useFocusable({ onSelect: onClick, region: 'panel' })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onClick}
      className={`tv-set-row ${danger ? '!border-red-400/25 hover:!border-red-400/50' : ''}`}
    >
      <span className="flex items-center gap-4">
        {Icon && (
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.07] text-white/80'}`}>
            <Icon className="w-6 h-6" />
          </span>
        )}
        <span>
          <span className={`tv-set-row-title block ${danger ? '!text-red-200' : ''}`}>{title}</span>
          {desc && <span className="tv-set-row-desc block">{desc}</span>}
        </span>
      </span>
      <ChevronRight className="w-6 h-6 text-white/35 shrink-0" />
    </button>
  )
}

function AudioSegment({ value, onChange }) {
  const subFocus = useFocusable({ onSelect: () => onChange('sub'), region: 'panel' })
  const dubFocus = useFocusable({ onSelect: () => onChange('dub'), region: 'panel' })
  return (
    <div className="tv-seg">
      <button ref={subFocus.ref} type="button" data-on={value === 'sub'} onClick={() => onChange('sub')}>SUB</button>
      <button ref={dubFocus.ref} type="button" data-on={value === 'dub'} onClick={() => onChange('dub')}>DUB</button>
    </div>
  )
}

/* ── Panels ──────────────────────────────────────────────────────────────── */

function PlaybackPanel() {
  const [settings, setSettings] = useState(() => loadVideoSettings())
  const [audio, setAudio] = useState(() => (localStorage.getItem('audioPreference') === 'dub' ? 'dub' : 'sub'))
  const set = (key) => (val) => {
    setSettings((s) => ({ ...s, [key]: val }))
    saveVideoSetting(key, val)
  }
  const setAudioPref = (mode) => {
    setAudio(mode)
    saveAudioPreference(mode)
  }
  return (
    <div className="space-y-3.5 tv-enter">
      <ToggleRow
        title="Auto Play Next Episode"
        desc="When an episode ends, start the next one automatically."
        on={settings.autoplay !== false}
        onChange={set('autoplay')}
      />
      <ToggleRow
        title="Skip Intro Automatically"
        desc="Jump past detected intro chapters while watching."
        on={settings.autoSkip !== false}
        onChange={set('autoSkip')}
      />
      <ToggleRow
        title="Subtitles by Default"
        desc="Turn subtitles on when a stream provides them."
        on={settings.subsDefault !== false}
        onChange={set('subsDefault')}
      />
      <div className="tv-set-row">
        <span>
          <span className="tv-set-row-title block">Default Audio Track</span>
          <span className="tv-set-row-desc block">Used whenever a watch link doesn't specify one.</span>
        </span>
        <AudioSegment value={audio} onChange={setAudioPref} />
      </div>
    </div>
  )
}

function AccountPanel() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) {
    return (
      <div className="space-y-3.5 tv-enter">
        <div className="tv-set-row !items-center">
          <span>
            <span className="tv-set-row-title block">Signed out</span>
            <span className="tv-set-row-desc block">Sign in to sync your watchlist, favorites and watch progress across devices.</span>
          </span>
        </div>
        <ActionRow title="Sign In" desc="Opens the Kaisen X sign-in screen." icon={User} onClick={() => navigate('/login')} />
      </div>
    )
  }
  return (
    <div className="space-y-3.5 tv-enter">
      <div className="tv-set-row">
        <span className="flex items-center gap-4">
          <span
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#A78BFA,#8B5CF6 50%,#6366F1)' }}
          >
            {(user.name || 'U')[0]?.toUpperCase()}
          </span>
          <span>
            <span className="tv-set-row-title block">{user.name}</span>
            <span className="tv-set-row-desc block">{user.email || 'Signed in with Firebase'}</span>
          </span>
        </span>
        <span className="tv-status-pill" style={{ background: 'rgba(52,211,153,0.14)', color: '#34d399', border: '1px solid rgba(52,211,153,0.35)' }}>
          <Check className="w-4 h-4" /> Signed in
        </span>
      </div>
      <ActionRow title="Profile" desc="Watchlist, favorites and account details." icon={User} onClick={() => navigate('/tv/profile')} />
      <ActionRow title="My List" desc="Everything you saved to watch later." icon={LayoutGrid} onClick={() => navigate('/tv/watchlist')} />
      <ActionRow title="Watch History" desc="Jump back into anything you've watched." icon={Clock} onClick={() => navigate('/tv/history')} />
      <ActionRow title="Sign Out" icon={X} onClick={() => logout()} />
    </div>
  )
}

function ServersPanel() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tv-provider-health'],
    queryFn: () => fetch(`${API_BASE}/api/health/providers`).then((r) => r.json()),
    staleTime: 60 * 1000,
  })
  if (isLoading) {
    return (
      <div className="flex items-center gap-4 p-10 text-white/60 text-lg">
        <Loader2 className="w-7 h-7 animate-spin" /> Checking server health…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="p-8">
        <p className="text-lg text-red-300 mb-4">Couldn't load server status.</p>
        <RetryButton onRetry={refetch} />
      </div>
    )
  }
  const providers = [...(data?.providers || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)))
  if (!providers.length) return <p className="p-8 text-lg text-white/55">No server information reported yet.</p>

  return (
    <div className="space-y-3.5 tv-enter">
      <p className="text-sm text-white/40 px-1">Live status from the Kaisen X streaming backend.</p>
      {providers.map((p) => {
        const meta = statusMeta(p.class)
        const name = PROVIDER_NAMES[p.name] || (p.name ? p.name.charAt(0).toUpperCase() + p.name.slice(1) : 'Unknown')
        return (
          <div key={p.name} className="tv-set-row">
            <span className="flex items-center gap-4 min-w-0">
              <span className="w-11 h-11 rounded-xl bg-white/[0.07] flex items-center justify-center shrink-0">
                <Server className="w-6 h-6 text-white/75" />
              </span>
              <span className="min-w-0">
                <span className="tv-set-row-title block truncate">{name}</span>
                <span className="tv-set-row-desc block">
                  {p.calls != null && `${p.calls} calls · avg ${Math.round(p.avgMs || 0)}ms`}
                  {p.diagnostic ? ` · ${String(p.diagnostic).slice(0, 60)}` : ''}
                </span>
              </span>
            </span>
            <span className="tv-status-pill shrink-0" style={{
              background: `${meta.color}1f`,
              color: meta.color,
              border: `1px solid ${meta.color}59`,
            }}>
              {meta.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function RetryButton({ onRetry }) {
  const focus = useFocusable({ onSelect: onRetry, region: 'panel' })
  return (
    <button ref={focus.ref} type="button" onClick={onRetry} className="tv-btn-primary rounded-xl px-7 py-3 text-base font-bold">
      Retry
    </button>
  )
}

function ContentPanel() {
  const [audio, setAudio] = useState(() => (localStorage.getItem('audioPreference') === 'dub' ? 'dub' : 'sub'))
  const setAudioPref = (mode) => { setAudio(mode); saveAudioPreference(mode) }
  return (
    <div className="space-y-3.5 tv-enter">
      <div className="tv-set-row">
        <span>
          <span className="tv-set-row-title block">Preferred Language</span>
          <span className="tv-set-row-desc block">Japanese audio with subtitles or English dub.</span>
        </span>
        <AudioSegment value={audio} onChange={setAudioPref} />
      </div>
      <DisabledRow title="Content Region" desc="Not available yet." />
      <DisabledRow title="Parental Filter" desc="Not available yet." />
    </div>
  )
}

function ListSyncPanel() {
  return (
    <div className="space-y-3.5 tv-enter">
      <div className="tv-set-row">
        <span className="flex items-center gap-4">
          <span className="w-11 h-11 rounded-xl bg-white/[0.07] flex items-center justify-center shrink-0">
            <RefreshCw className="w-6 h-6 text-white/75" />
          </span>
          <span>
            <span className="tv-set-row-title block">AniList</span>
            <span className="tv-set-row-desc block">External list syncing isn't part of Kaisen X yet.</span>
          </span>
        </span>
        <span className="tv-status-pill" style={{ background: 'rgba(148,163,184,0.12)', color: '#cbd5e1', border: '1px solid rgba(148,163,184,0.3)' }}>
          Not connected
        </span>
      </div>
      <DisabledRow title="Sync Watch Progress" desc="Requires an AniList connection." />
      <DisabledRow title="Sync Favorites" desc="Requires an AniList connection." />
      <DisabledRow title="Sync Completed Anime" desc="Requires an AniList connection." />
    </div>
  )
}

function NotificationsPanel() {
  const [prefs, setPrefs] = useState(() => loadNotificationPrefs())
  const set = (key) => (val) => {
    const next = { ...prefs, [key]: val }
    setPrefs(next)
    saveNotificationPrefs(next)
  }
  const master = prefs.pushEnabled
  return (
    <div className="space-y-3.5 tv-enter">
      <ToggleRow
        title="Push Notifications"
        desc="Allow Kaizen X to send notifications."
        on={master}
        onChange={set('pushEnabled')}
      />
      <ToggleRow
        title="New Episode Alerts"
        desc="Get notified when an anime in your list has a new ep."
        on={prefs.newEpisodeAlerts}
        onChange={set('newEpisodeAlerts')}
        disabled={!master}
      />
      <ToggleRow
        title="Airing Reminders"
        desc="Get reminded before an episode starts."
        on={prefs.airingReminders}
        onChange={set('airingReminders')}
        disabled={!master}
      />
      <ToggleRow
        title="My List Updates"
        desc="Updates about anime you've saved."
        on={prefs.myListUpdates}
        onChange={set('myListUpdates')}
        disabled={!master}
      />
      <ToggleRow
        title="Continue Watching"
        desc="Reminders about unfinished episodes."
        on={prefs.continueWatchingReminders}
        onChange={set('continueWatchingReminders')}
        disabled={!master}
      />
      <ToggleRow
        title="App Announcements"
        desc="Important Kaizen X news and updates."
        on={prefs.appAnnouncements}
        onChange={set('appAnnouncements')}
        disabled={!master}
      />
    </div>
  )
}

function AboutView({ onBack }) {
  const backFocus = useFocusable({ onSelect: onBack, region: 'panel' })
  return (
    <div className="space-y-4 tv-enter">
      <BackLink focusRef={backFocus.ref} onClick={onBack} />
      <div className="tv-card rounded-2xl p-10 flex items-center gap-8">
        <span className="tv-logo-mark w-24 h-24 rounded-3xl flex items-center justify-center text-4xl font-black text-white shrink-0" style={{ fontFamily: "'Outfit', sans-serif" }}>
          KX
        </span>
        <div>
          <h3 className="text-4xl font-black tv-brand-text" style={{ fontFamily: "'Outfit', sans-serif" }}>KAISEN X Anime</h3>
          <p className="text-lg text-white/55 mt-2">Version 1.0 · Build DPAD-FIX-2026-08-26-A</p>
          <p className="text-base text-white/45 mt-4 max-w-2xl leading-relaxed">
            A cinematic anime streaming experience built for Android TV. Watch subbed and dubbed anime in HD,
            pick up where you left off, and browse the full AniList catalog — designed entirely around remote-first navigation.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InfoCard title="Streaming" lines={['Kaisen X streaming API (provider fallback)', 'HLS adaptive playback via hls.js']} />
        <InfoCard title="Data & Services" lines={['AniList GraphQL (catalog & metadata)', 'Firebase Authentication']} />
      </div>
    </div>
  )
}

function InfoCard({ title, lines }) {
  return (
    <div className="tv-card rounded-2xl p-7">
      <h4 className="text-xl font-bold mb-3">{title}</h4>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l} className="text-base text-white/55 flex items-start gap-2.5">
            <Check className="w-4.5 h-4.5 mt-1 text-cyan-300 shrink-0 w-[18px]" /> {l}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BackLink({ focusRef, onClick, label = 'Back to App settings' }) {
  return (
    <button ref={focusRef} type="button" onClick={onClick} className="inline-flex items-center gap-2 text-lg font-semibold text-cyan-300 hover:text-cyan-200">
      ← {label}
    </button>
  )
}

function StaticDocView({ title, children, onBack }) {
  const backFocus = useFocusable({ onSelect: onBack, region: 'panel' })
  return (
    <div className="space-y-5 tv-enter">
      <BackLink focusRef={backFocus.ref} onClick={onBack} label={`Back to App settings`} />
      <div className="tv-card rounded-2xl p-9 max-h-[62vh] overflow-y-auto tv-row-scroll">
        <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>{title}</h3>
        <div className="prose-invert space-y-3 text-white/60 leading-relaxed [&_a]:text-cyan-300 [&_li]:ml-5 [&_ul]:list-disc">
          {children}
        </div>
      </div>
    </div>
  )
}

function AppPanel({ pushView }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const clearCache = () => {
    try { localStorage.removeItem('cw_guest') } catch { /* ignore */ }
    queryClient.clear()
    window.location.reload()
  }
  return (
    <div className="space-y-3.5 tv-enter">
      <ActionRow title="About App" desc="Version, build and credits." icon={Info} onClick={() => pushView('about')} />
      <ActionRow title="Privacy Policy" icon={ShieldAlert} onClick={() => pushView('privacy')} />
      <ActionRow title="Terms of Service" icon={FileText} onClick={() => pushView('terms')} />
      <ActionRow title="Licenses" desc="Open-source software used by Kaisen X." icon={ScrollText} onClick={() => pushView('licenses')} />
      {user && (
        <ActionRow
          title="Clear Watch History"
          desc="Removes every Continue Watching entry."
          icon={Trash2}
          danger
          onClick={() => pushView('confirm-history')}
        />
      )}
      <ActionRow title="Clear Cache" desc="Reloads the app with fresh content." icon={Eraser} onClick={clearCache} />
    </div>
  )
}

/* ── Root screen ─────────────────────────────────────────────────────────── */

export default function TVSettings() {
  const [category, setCategory] = useState('playback')
  const [view, setView] = useState(null) // null | about | privacy | terms | licenses | confirm-history

  useTVBackHandler(view === 'confirm-history', () => setView(null))
  useTVBackHandler(view && view !== 'confirm-history', () => setView(null))
  // No root handler: BACK on the settings list must pop route history and
  // leave the page. (A no-op handler here swallowed the first BACK press.)

  // Dialog lives here so its buttons can act on real state.
  const dialogScope = useTVScope(view === 'confirm-history')
  const cancelFocus = useFocusable({ onSelect: () => setView(null), scope: dialogScope, autoFocus: view === 'confirm-history', region: 'dialog' })

  return (
    <div className="px-16 py-10 pb-20 tv-enter">
      <div className="mb-8 flex items-center gap-3">
        <span className="tv-accent-bar !h-9" />
        <h1 className="text-4xl font-black" style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em' }}>Settings</h1>
      </div>

      {view === 'confirm-history' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="tv-card rounded-3xl p-10 w-[620px] text-center shadow-2xl">
            <span className="mx-auto mb-5 w-16 h-16 rounded-full bg-red-500/15 border border-red-400/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-300" />
            </span>
            <h2 className="text-3xl font-bold mb-2">Clear Watch History?</h2>
            <p className="text-lg text-white/55 mb-9">This will remove your entire watch history on this device.</p>
            <div className="flex justify-center gap-4">
              <button ref={cancelFocus.ref} type="button" onClick={() => setView(null)} className="tv-btn-ghost rounded-xl px-9 py-3.5 text-lg font-semibold">
                Cancel
              </button>
              <ConfirmClearButton onDone={() => setView(null)} />
            </div>
          </div>
        </div>
      ) : view ? (
        <div className="max-w-4xl">
          {view === 'about' && <AboutView onBack={() => setView(null)} />}
          {view === 'privacy' && (
            <StaticDocView title="Privacy Policy" onBack={() => setView(null)}>
              <p>Kaisen X stores your account, watchlist, favorites and watch progress in Firebase to sync across your devices. Catalog metadata comes from AniList; video streams come from third-party sources through the Kaisen X streaming API.</p>
              <p>We never sell your data. For the full policy, read the Privacy page on the Kaisen X website.</p>
            </StaticDocView>
          )}
          {view === 'terms' && (
            <StaticDocView title="Terms of Service" onBack={() => setView(null)}>
              <p>Kaisen X is provided for personal, non-commercial use. Content metadata is supplied by AniList; streams are sourced from publicly available third-party providers.</p>
              <p>By using the app you agree to use it only where such access is lawful in your region.</p>
            </StaticDocView>
          )}
          {view === 'licenses' && (
            <StaticDocView title="Open-Source Licenses" onBack={() => setView(null)}>
              <ul className="space-y-2">
                {['React', 'Vite', 'Tailwind CSS', 'TanStack Query', 'React Router', 'hls.js', 'lucide-react', 'Capacitor'].map((n) => (
                  <li key={n}>{n} — used under its MIT license.</li>
                ))}
              </ul>
              <p className="pt-2">AniList data is used under the AniList API terms. All anime artwork belongs to its respective owners.</p>
            </StaticDocView>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[320px_1fr] gap-8 items-start">
          <div className="space-y-3 pr-2">
            {CATEGORIES.map((c, i) => (
              <CategoryButton
                key={c.id}
                cat={c}
                selected={category === c.id}
                onSelect={setCategory}
                // The first category is the page's deterministic navbar entry:
                // RIGHT from Settings -> settings-category-0, and LEFT from it
                // returns to the navbar.
                focusKey={i === 0 ? 'settings-category-0' : null}
                autoFocus={i === 0}
                exit={i === 0 ? { left: 'navbar-settings' } : null}
              />
            ))}
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold mb-5 text-white/90">
              {CATEGORIES.find((c) => c.id === category)?.label}
              {' '}
              <span className="text-white/35 text-lg font-medium">Settings</span>
            </h2>
            {category === 'playback' && <PlaybackPanel />}
            {category === 'appearance' && <AppearancePanel />}
            {category === 'account' && <AccountPanel />}
            {category === 'servers' && <ServersPanel />}
            {category === 'content' && <ContentPanel />}
            {category === 'listsync' && <ListSyncPanel />}
            {category === 'notifications' && <NotificationsPanel />}
            {category === 'app' && <AppPanelInner onPush={(v) => setView(v)} />}
          </div>
        </div>
      )}
    </div>
  )
}

function ConfirmClearButton({ onDone }) {
  const { user, removeContinueWatching } = useAuth()
  const focus = useFocusable({ onSelect: () => { (user?.continueWatching || []).forEach((e) => e.animeId && removeContinueWatching(e.animeId)); onDone() }, scope: 'dialog', region: 'dialog' })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={() => { (user?.continueWatching || []).forEach((e) => e.animeId && removeContinueWatching(e.animeId)); onDone() }}
      className="rounded-xl px-9 py-3.5 text-lg font-bold text-white"
      style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)', boxShadow: '0 10px 30px rgba(239,68,68,0.35)' }}
    >
      Clear
    </button>
  )
}

// Thin wrapper keeps hook order stable inside TVSettings' tree.
function AppPanelInner({ onPush }) {
  return <AppPanel pushView={onPush} />
}

function AppearancePanel() {
  const [posterSize, setPosterSize] = useState(() => loadPosterSize())

  const pick = (key) => {
    setPosterSize(key)
    savePosterSize(key)
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-xl font-bold mb-1.5">Poster Size</h3>
        <p className="text-white/50 mb-4" style={{ fontSize: '15px' }}>
          How large anime posters appear on Home, Browse and Catalog screens.
        </p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(POSTER_SIZES).map(([key, conf]) => (
            <PosterSizeOption
              key={key}
              sizeKey={key}
              label={conf.label}
              width={conf.width}
              selected={posterSize === key}
              onSelect={() => pick(key)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function PosterSizeOption({ sizeKey, label, width, selected, onSelect }) {
  const focus = useFocusable({ onSelect, region: 'panel' })
  return (
    <button
      ref={focus.ref}
      type="button"
      onClick={onSelect}
      aria-label={`Poster size ${label}`}
      className={`tv-card rounded-2xl border p-4 flex items-center gap-4 transition-colors ${
        selected ? '' : 'bg-white/[0.04] border-white/10'
      }`}
      style={selected ? { background: 'rgba(139,92,246,0.22)', borderColor: 'rgba(139,92,246,0.65)' } : undefined}
    >
      <span
        className="rounded-md bg-gradient-to-br from-[#2a3550] to-[#141b2e] border border-white/15 shrink-0"
        style={{ width: `${Math.round(width / 6)}px`, height: `${Math.round(width / 4)}px` }}
      />
      <span className="text-left">
        <span className="block text-lg font-bold">{label}</span>
        <span className="block text-sm text-white/45 font-medium">{width} px</span>
      </span>
      {selected && <Check className="w-5 h-5 ml-1" style={{ color: '#a78bfa' }} />}
    </button>
  )
}
