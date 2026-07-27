import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, MessageSquare, HelpCircle } from 'lucide-react'

const FAQ = [
  {
    q: 'Is Kaisen X Anime free to use?',
    a: 'Yes. Kaisen X Anime is a free platform for browsing and tracking anime. No payment is required.',
  },
  {
    q: 'Where does the anime data come from?',
    a: 'Anime metadata, artwork, and information are sourced from AniList and other third-party APIs. We do not host or stream any copyrighted video content.',
  },
  {
    q: 'How do I reset my password?',
    a: 'Go to the Login page and click "Forgot Password". A reset link will be sent to your registered email address.',
  },
  {
    q: 'How do I change my avatar or display name?',
    a: 'Go to Settings from the navbar dropdown. You can update your display name and choose a new avatar there.',
  },
  {
    q: 'Can I delete my account?',
    a: 'Account deletion is not currently supported through the app. Please contact us via email and we will process your request.',
  },
  {
    q: 'How do I report a bug or suggest a feature?',
    a: 'Send us an email at kaisenxanime.support@gmail.com with a description of the issue or your idea.',
  },
]

export default function HelpCenter() {
  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/home" className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-primary" /> Help Center
        </h1>
      </div>

      <div className="space-y-8">
        <section className="bg-surface rounded-2xl border border-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" /> Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white/5 rounded-xl p-4">
                <p className="text-white font-medium text-sm mb-1">{item.q}</p>
                <p className="text-gray-400 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface rounded-2xl border border-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" /> Contact Us
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Have a question, issue, or suggestion? Reach out to us directly.
          </p>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white font-medium">Email</p>
            <a
              href="mailto:kaisenxanime.support@gmail.com"
              className="text-primary-light hover:text-primary transition-colors text-sm"
            >
              kaisenxanime.support@gmail.com
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
