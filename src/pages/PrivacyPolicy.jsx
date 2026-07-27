import { Link } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/home" className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Privacy Policy
        </h1>
      </div>

      <p className="text-sm text-gray-500 mb-8">Last Updated: July 27, 2026</p>

      <div className="space-y-8 text-gray-300 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
          <p>
            Your privacy is important to us. This Privacy Policy explains how Kaisen X Anime collects,
            uses, and protects your information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>

          <h3 className="text-white font-medium mt-4 mb-2">Account Information</h3>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Username</li>
            <li>Email address</li>
            <li>Profile avatar</li>
            <li>Account creation date</li>
          </ul>

          <h3 className="text-white font-medium mt-4 mb-2">Usage Information</h3>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Watch history</li>
            <li>Continue Watching progress</li>
            <li>Favorites</li>
            <li>Watchlist</li>
            <li>Ratings</li>
            <li>Comments and replies</li>
            <li>Likes and dislikes</li>
          </ul>

          <h3 className="text-white font-medium mt-4 mb-2">Technical Information</h3>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Browser type</li>
            <li>Device type</li>
            <li>IP address (if collected by hosting or analytics providers)</li>
            <li>Log information</li>
            <li>Error reports</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
          <p className="mb-2">We use your information to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Provide the streaming platform.</li>
            <li>Save your progress.</li>
            <li>Synchronize your account across devices.</li>
            <li>Personalize recommendations.</li>
            <li>Improve performance.</li>
            <li>Detect abuse and spam.</li>
            <li>Respond to support requests.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">4. Firestore and Firebase</h2>
          <p>
            We use Google Firebase to securely store account information and application data. Your
            information is protected using Firebase Authentication and Firestore security rules.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">5. Cookies and Local Storage</h2>
          <p className="mb-2">We may use cookies or local storage to remember:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Theme preference</li>
            <li>Language</li>
            <li>Login session</li>
            <li>Playback settings</li>
            <li>Subtitle preferences</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">6. Sharing Information</h2>
          <p>
            We do not sell your personal information. We may share limited information only with
            trusted service providers required to operate the platform, such as authentication,
            hosting, analytics, or cloud infrastructure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">7. Data Security</h2>
          <p>
            We use reasonable security measures to protect your information. However, no internet
            service can guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">8. User Controls</h2>
          <p className="mb-2">You may:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Change your username.</li>
            <li>Change your avatar.</li>
            <li>Update your profile.</li>
            <li>Delete your comments.</li>
            <li>Remove anime from Favorites or Watchlist.</li>
            <li>Request deletion of your account (if supported).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">9. Children's Privacy</h2>
          <p>
            The platform is not intended for children under 13 years of age. We do not knowingly
            collect personal information from children under the applicable minimum age.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes become effective once
            published.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">11. Contact Us</h2>
          <p>
            For questions regarding this Privacy Policy, please contact us through the platform's
            support page or contact email.
          </p>
        </section>
      </div>
    </div>
  )
}
