import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft, Palette, Globe, Eye, EyeOff, User, Mail, Lock,
  Save, CheckCircle, LogOut, Monitor, SkipForward, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ACCENT_COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Rose', value: '#F43F5E' },
]

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
]

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('appSettings') || '{}')
  } catch { return {} }
}

function saveSettings(settings) {
  localStorage.setItem('appSettings', JSON.stringify(settings))
  applySettings(settings)
}

function applySettings(settings) {
  const root = document.documentElement
  const accent = settings.accentColor || '#E01B24'
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--button-primary', accent)
  if (settings.reduceAnimations) root.classList.add('reduce-animations')
  else root.classList.remove('reduce-animations')
  if (settings.language) root.setAttribute('lang', settings.language)
}

export default function Settings() {
  const { user, logout, resetPassword, updateProfileField } = useAuth()
  const [settings, setSettings] = useState(() => getSettings())
  const [name, setName] = useState(user?.name || '')
  const [saved, setSaved] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [passwordResetSent, setPasswordResetSent] = useState(false)

  useEffect(() => { applySettings(settings) }, [])

  if (!user) return <Navigate to="/login" replace />

  const handleAccentColor = (color) => {
    const updated = { ...settings, accentColor: color }
    setSettings(updated)
    saveSettings(updated)
  }

  const handleToggle = (key) => {
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    saveSettings(updated)
  }

  const handleLanguage = (code) => {
    const updated = { ...settings, language: code }
    setSettings(updated)
    saveSettings(updated)
  }

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === user.name) return
    await updateProfileField({ name: name.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleResetPassword = async () => {
    try {
      await resetPassword(user.email)
      setPasswordResetSent(true)
    } catch { /* silent */ }
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/home" className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      <div className="space-y-6">
        <section className="bg-surface rounded-2xl border border-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-primary" /> Account
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Display Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={handleSaveName}
                  disabled={!name.trim() || name.trim() === user.name}
                  className="px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                  {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400">
                <Mail className="w-4 h-4" />
                {user.email}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleResetPassword}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {passwordResetSent ? 'Reset link sent!' : 'Reset Password'}
              </button>
              <button
                onClick={() => { logout(); }}
                className="px-4 py-2 bg-white/5 hover:bg-red-500/10 text-gray-300 hover:text-red-400 text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </section>

        <section className="bg-surface rounded-2xl border border-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" /> Appearance
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Accent Color</label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => handleAccentColor(c.value)}
                    className={`w-9 h-9 rounded-full transition-all ${
                      (settings.accentColor || '#E01B24') === c.value
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110'
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {settings.reduceAnimations ? (
                  <EyeOff className="w-5 h-5 text-gray-400" />
                ) : (
                  <Eye className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-white">Reduce Animations</p>
                  <p className="text-xs text-gray-500">Minimize motion effects</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('reduceAnimations')}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  settings.reduceAnimations ? 'bg-primary' : 'bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.reduceAnimations ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SkipForward className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-white">Autoplay Next Episode</p>
                  <p className="text-xs text-gray-500">Automatically play the next episode</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('autoplay')}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  settings.autoplay !== false ? 'bg-primary' : 'bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.autoplay !== false ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-white">Hide Spoiler Comments</p>
                  <p className="text-xs text-gray-500">Keep spoiler comments hidden until revealed</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('hideSpoilers')}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  settings.hideSpoilers ? 'bg-primary' : 'bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.hideSpoilers ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="bg-surface rounded-2xl border border-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" /> Language
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguage(lang.code)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  (settings.language || 'en') === lang.code
                    ? 'bg-primary text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-surface rounded-2xl border border-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" /> About
          </h2>
          <div className="space-y-2 text-sm text-gray-400">
            <p>Kaisen X Anime v1.0</p>
            <p>Your data is stored securely in Firebase.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
