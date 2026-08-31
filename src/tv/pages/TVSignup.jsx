import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, User, ArrowRight, Check, Circle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFocusable, useFocusContainer, useTVFocus } from '../TVFocusManager'

const rules = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One number', test: (p) => /\d/.test(p) },
  { label: 'One special character', test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p) },
]

const MASKED = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'

// A D-pad focusable signup field. Renders as an input-like card carrying a
// stable focusKey so the vertical container navigation is deterministic:
//   signup-name --DOWN--> signup-email --DOWN--> signup-password
//     --DOWN--> signup-confirm-password --DOWN--> signup-submit
// LEFT from the container's cells routes to navbar-signup via the form
// container's declared left exit. Text entry uses the physical-keyboard
// listener in TVSignup (these are tv-focusable cards, not native <input>s, so
// arrow keys reach the TV focus engine).
function SignupField({ focusKey, label, icon: Icon, value, masked = false, autoFocus = false, onSelect }) {
  const focus = useFocusable({
    focusKey,
    onSelect,
    autoFocus,
    region: 'signup',
    container: 'signup-form',
  })
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
      <div
        ref={focus.ref}
        data-signup-field
        className="relative flex items-center rounded-xl border transition-all cursor-text"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
      >
        <Icon className="absolute left-3 w-5 h-5 text-gray-400" />
        <div className="w-full pl-11 pr-4 py-3 text-white text-base whitespace-pre truncate">
          {value ? (masked ? MASKED : value) : <span className="text-gray-500">{label}</span>}
        </div>
      </div>
    </div>
  )
}

function SubmitButton({ focusKey, loading, disabled, onSelect }) {
  const focus = useFocusable({
    focusKey,
    onSelect,
    region: 'signup',
    container: 'signup-form',
  })
  return (
    <button
      ref={focus.ref}
      type="button"
      disabled={disabled || loading}
      onClick={onSelect}
      className="w-full py-3 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
      style={{
        background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
        opacity: disabled || loading ? 0.5 : 1,
      }}
    >
      {loading ? (
        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <>Create Account <ArrowRight className="w-4 h-4" /></>
      )}
    </button>
  )
}

export default function TVSignup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Which form field the TV focus system is currently on, for the physical
  // keyboard listener. Never a native <input>, so arrow keys stay in scope.
  const activeKeyRef = useRef('signup-name')

  const passwordStrength = useMemo(() => rules.map((r) => r.test(password)), [password])

  // Deterministic form container. preferredChildKey routes focus into the Name
  // field whenever the container/this page receives focus; a declared LEFT exit
  // returns the first field back to navbar-signup without geometric scoring.
  const form = useFocusContainer({
    id: 'signup-form',
    region: 'signup',
    preferredChildKey: 'signup-name',
    exits: { left: 'navbar-signup' },
  })

  const ctx = useTVFocus()

  // Track which field is tv-focused so typed characters land in the right one.
  useEffect(() => {
    const onFocusIn = (e) => {
      const key = e.target && e.target.getAttribute && e.target.getAttribute('data-tv-key')
      if (key && key.startsWith('signup-')) activeKeyRef.current = key
    }
    window.addEventListener('focusin', onFocusIn)
    return () => window.removeEventListener('focusin', onFocusIn)
  }, [])

  // Physical keyboard entry (USB / remote keyboards).
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Backspace') {
        const k = activeKeyRef.current
        if (k === 'signup-name') setName((v) => v.slice(0, -1))
        else if (k === 'signup-email') setEmail((v) => v.slice(0, -1))
        else if (k === 'signup-password') setPassword((v) => v.slice(0, -1))
        else if (k === 'signup-confirm-password') setConfirmPassword((v) => v.slice(0, -1))
        return
      }
      if (e.key.length === 1 && /[a-zA-Z0-9 @._-]/.test(e.key)) {
        const k = activeKeyRef.current
        if (k === 'signup-name') setName((v) => (v + e.key).slice(0, 60))
        else if (k === 'signup-email') setEmail((v) => (v + e.key).slice(0, 120))
        else if (k === 'signup-password') setPassword((v) => (v + e.key).slice(0, 128))
        else if (k === 'signup-confirm-password') setConfirmPassword((v) => (v + e.key).slice(0, 128))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const advance = (key) => {
    if (key === 'signup-name' && ctx?.applyFocus) ctx.applyFocus('signup-email')
    else if (key === 'signup-email' && ctx?.applyFocus) ctx.applyFocus('signup-password')
    else if (key === 'signup-password' && ctx?.applyFocus) ctx.applyFocus('signup-confirm-password')
    else if (key === 'signup-confirm-password' && ctx?.applyFocus) ctx.applyFocus('signup-submit')
  }

  const handleSubmit = async () => {
    if (loading) return
    if (!name.trim() || !email.trim() || !password) {
      setError('Please fill in all fields')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      await signup(name.trim(), email.trim(), password)
      navigate('/tv')
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError('An account with this email already exists')
      else if (err.code === 'auth/weak-password') setError('Password must be at least 6 characters')
      else if (err.code === 'auth/invalid-email') setError('Invalid email address')
      else setError('Signup failed. Please try again')
      setLoading(false)
    }
  }

  const valid = passwordStrength.every(Boolean)

  return (
    <div className="min-h-full flex items-start justify-center px-8 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#A78BFA,#8B5CF6 50%,#6366F1)' }}>
            <span className="text-white text-2xl font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>KX</span>
          </div>
          <h1 className="text-4xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em' }}>Create Account</h1>
          <p className="text-white/45 mt-1">Join the anime community today</p>
        </div>

        <div
          ref={form.ref}
          className="rounded-2xl border border-white/10 p-6 sm:p-8 space-y-5"
          style={{ background: 'rgba(255,255,255,0.045)', backdropFilter: 'blur(20px)' }}
        >
          <SignupField
            focusKey="signup-name"
            label="Full Name"
            icon={User}
            value={name}
            autoFocus
            onSelect={() => advance('signup-name')}
          />

          <SignupField
            focusKey="signup-email"
            label="Email"
            icon={Mail}
            value={email}
            onSelect={() => advance('signup-email')}
          />

          <SignupField
            focusKey="signup-password"
            label="Password"
            icon={Lock}
            value={password}
            masked
            onSelect={() => advance('signup-password')}
          />

          <div>
            <SignupField
              focusKey="signup-confirm-password"
              label="Confirm Password"
              icon={Lock}
              value={confirmPassword}
              masked
              onSelect={() => advance('signup-confirm-password')}
            />
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-400 mt-1.5">Passwords do not match</p>
            )}
            {password && (
              <div className="mt-3 space-y-1.5">
                {rules.map((rule, i) => (
                  <div key={rule.label} className={`flex items-center gap-2 text-xs transition-colors ${passwordStrength[i] ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {passwordStrength[i] ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0" />}
                    {rule.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <SubmitButton
            focusKey="signup-submit"
            loading={loading}
            disabled={!valid}
            onSelect={handleSubmit}
          />
        </div>
      </div>
    </div>
  )
}
