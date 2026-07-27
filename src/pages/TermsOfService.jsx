import { Link } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/home" className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> Terms of Service
        </h1>
      </div>

      <p className="text-sm text-gray-500 mb-8">Last Updated: July 27, 2026</p>

      <div className="space-y-8 text-gray-300 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
          <p>
            Welcome to Kaisen X Anime ("we", "our", or "the Platform"). By creating an account or using
            Kaisen X Anime, you agree to these Terms of Service. If you do not agree, please do not use
            the platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">2. Eligibility</h2>
          <p>
            You must be at least 13 years old, or the minimum legal age in your country, to create an
            account and use our services.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">3. User Accounts</h2>
          <p className="mb-2">When creating an account, you agree to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Provide accurate information.</li>
            <li>Keep your login credentials secure.</li>
            <li>Be responsible for all activity on your account.</li>
            <li>Notify us immediately if you believe your account has been compromised.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">4. Community Guidelines</h2>
          <p className="mb-2">Users must not:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Post hateful, abusive, or harassing content.</li>
            <li>Upload malicious software or spam.</li>
            <li>Impersonate another person.</li>
            <li>Post illegal content.</li>
            <li>Encourage violence or discrimination.</li>
            <li>Abuse the comment or rating systems.</li>
          </ul>
          <p className="mt-2">
            Violation of these rules may result in temporary or permanent suspension.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">5. Comments and User Content</h2>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>You retain ownership of your comments.</li>
            <li>By posting comments, you grant Kaisen X Anime permission to display them on the platform.</li>
            <li>We reserve the right to remove comments that violate our Community Guidelines.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">6. Spoilers</h2>
          <p>
            Users are encouraged to mark comments containing spoilers. Repeatedly posting unmarked
            spoilers may result in moderation actions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">7. Anime Information</h2>
          <p>
            Anime information, artwork, and metadata displayed on the platform may come from third-party
            providers such as AniList or other licensed APIs. These remain the property of their
            respective owners.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">8. Availability</h2>
          <p>
            We strive to keep the platform available but cannot guarantee uninterrupted service.
            Maintenance, updates, or technical issues may temporarily affect availability.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">9. Intellectual Property</h2>
          <p>
            The Kaisen X Anime name, logo, design, interface, and original content belong to Kaisen X
            Anime. Users may not copy or redistribute our original content without permission.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">10. Account Suspension</h2>
          <p className="mb-2">We may suspend or terminate accounts that:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Break these Terms.</li>
            <li>Abuse other users.</li>
            <li>Attempt to exploit platform features.</li>
            <li>Engage in fraudulent activity.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">11. Limitation of Liability</h2>
          <p className="mb-2">Kaisen X Anime is provided "as is." We are not responsible for:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Data loss</li>
            <li>Service interruptions</li>
            <li>Third-party content</li>
            <li>Damages arising from the use of the platform</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">12. Changes to These Terms</h2>
          <p>
            These Terms may be updated periodically. Continued use of the platform after updates
            constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">13. Contact</h2>
          <p>
            If you have questions about these Terms, please contact us through the platform's support
            page or contact email.
          </p>
        </section>
      </div>
    </div>
  )
}
