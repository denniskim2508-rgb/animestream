import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Film, ArrowRight, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const { resetPassword } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      if (err.code === 'auth/user-not-found') setError('No account found with this email')
      else setError('Failed to send reset link. Try again')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Film className="w-7 h-7 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white">Reset Password</h1>
          <p className="text-gray-400 mt-1">We&apos;ll send you a link to reset your password</p>
        </div>

        {sent ? (
          <div className="bg-surface/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Check Your Email</h2>
            <p className="text-gray-400 text-sm mb-6">
              We&apos;ve sent a password reset link to <span className="text-white">{email}</span>
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-primary-light hover:text-primary text-sm font-medium transition-colors"
            >
              Didn&apos;t receive it? Try again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-surface/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              Send Reset Link <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-400 mt-6">
          <Link to="/login" className="text-primary-light hover:text-primary font-semibold transition-colors">
            ← Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
