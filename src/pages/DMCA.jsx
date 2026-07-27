import { Link } from 'react-router-dom'
import { ArrowLeft, Copyright } from 'lucide-react'

export default function DMCA() {
  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/home" className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Copyright className="w-6 h-6 text-primary" /> DMCA Copyright Policy
        </h1>
      </div>

      <p className="text-sm text-gray-500 mb-8">Last Updated: July 27, 2026</p>

      <div className="space-y-8 text-gray-300 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
          <p>
            Kaisen X Anime ("we", "our", or "the Platform") respects the intellectual property rights
            of copyright owners and expects users of our platform to do the same. If you believe that
            copyrighted material has been used on Kaisen X Anime without authorization, you may submit
            a copyright infringement notice as described below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">2. Copyright Infringement Notice</h2>
          <p className="mb-2">
            If you are a copyright owner, or are authorized to act on behalf of one, please provide
            the following information:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Your full name.</li>
            <li>Your company or organization (if applicable).</li>
            <li>Your email address.</li>
            <li>A description of the copyrighted work you believe has been infringed.</li>
            <li>The exact URL(s) or location of the allegedly infringing material.</li>
            <li>
              A statement that you have a good-faith belief that the use is not authorized by the
              copyright owner, its agent, or the law.
            </li>
            <li>
              A statement that the information in your notice is accurate and, under penalty of
              perjury, that you are the copyright owner or are authorized to act on the owner's behalf.
            </li>
            <li>Your electronic or physical signature.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">3. How to Submit a DMCA Notice</h2>
          <p className="mb-2">Please send your notice to:</p>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white font-medium">Copyright Agent</p>
            <p className="text-gray-400 mt-1">Email: kaisenxanime.support@gmail.com</p>
            <p className="text-gray-400">Subject: DMCA Takedown Request</p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">4. Our Response</h2>
          <p className="mb-2">Upon receiving a valid copyright complaint, we may:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Investigate the reported content.</li>
            <li>Remove or disable access to the material.</li>
            <li>Notify the affected user.</li>
            <li>Take additional action where appropriate.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">5. Counter-Notification</h2>
          <p className="mb-2">
            If you believe that material removed due to a DMCA complaint was removed by mistake or
            misidentification, you may submit a counter-notification containing:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
            <li>Your name.</li>
            <li>Your address.</li>
            <li>Your email address.</li>
            <li>Identification of the removed material.</li>
            <li>
              A statement under penalty of perjury that you believe the material was removed due to a
              mistake or misidentification.
            </li>
            <li>Your signature.</li>
          </ul>
          <p className="mt-2">
            If a valid counter-notification is received, we may restore the material unless the
            original complainant initiates legal action within the applicable legal timeframe.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">6. Repeat Infringers</h2>
          <p>
            Users who repeatedly infringe copyright may have their accounts suspended or permanently
            terminated.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">7. Third-Party Content</h2>
          <p>
            Kaisen X Anime may display metadata, artwork, descriptions, trailers, or other
            information obtained from third-party providers and APIs. All trademarks, logos, artwork,
            titles, and copyrighted materials remain the property of their respective owners.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">8. Good Faith Requirement</h2>
          <p>
            Submitting false or misleading copyright claims may have legal consequences. Please ensure
            that any notice submitted is accurate and made in good faith.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">9. Contact</h2>
          <p className="mb-2">For copyright-related questions, please contact:</p>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white font-medium">Copyright Agent</p>
            <p className="text-gray-400 mt-1">Email: kaisenxanime.support@gmail.com</p>
          </div>
        </section>
      </div>
    </div>
  )
}
