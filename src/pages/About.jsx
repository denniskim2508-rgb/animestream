import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function About() {
  return (
    <div className="min-h-screen bg-[#09090B]">
      <section className="relative max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center px-4 sm:px-6 lg:px-8 py-20 overflow-hidden">
        <div
          className="absolute inset-0 z-0 about-hero-bg"
          style={{
            backgroundImage: 'url(/jujutsu-bg.jpg)',
          }}
        />
        <div className="absolute inset-0 z-[1] bg-black/50" />
        <div className="relative z-[2]">
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white">
            ABOUT US
          </h1>
          <div className="w-[70px] h-1 bg-primary rounded-full mt-5 mb-5" />
          <h2 className="text-2xl font-medium text-primary mb-5">
            Your Ultimate Anime Destination
          </h2>
          <p className="text-gray-400 leading-relaxed mb-4 max-w-[520px] text-[15.5px]">
            Anyone who's tried to watch anime online for free knows the drill: sketchy pop-up ads, a UI stuck in 2010, or a "sign up now" wall the second you hit play. We got tired of that, so we built something better.
          </p>
          <p className="text-gray-400 leading-relaxed mb-6 max-w-[520px] text-[15.5px]">
            From timeless classics to the latest episodes, we've got it all in one clean, fast, ad-light place — built by fans who actually watch this stuff.
          </p>
          <Link
            to="/home"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-gradient-to-r from-primary to-purple-700 rounded-full font-semibold text-white hover:brightness-110 transition"
          >
            Explore Anime <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="collage-wrap relative z-[3] rounded-md overflow-hidden h-[340px] lg:h-[420px]">
          <img
            src="/collage.jpeg"
            alt="Anime collage"
            className="collage-img w-full h-full object-cover relative z-[1]"
          />
          <div className="collage-glow absolute inset-0 z-[2] pointer-events-none rounded-md" />
          <div className="collage-sweep absolute inset-0 z-[3] pointer-events-none rounded-md" />
          <div className="collage-gradient absolute inset-0 z-[2] pointer-events-none rounded-md" />
        </div>
      </section>

      <section className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <h3 className="text-2xl font-bold text-white border-l-4 border-primary pl-3.5 mb-3.5">
          What We're About
        </h3>
        <p className="text-gray-400 leading-[1.7] mb-4 text-[15.5px]">
          At our core, we're a hub for anime fans — a spot to catch up on new releases, revisit old favorites, and find recommendations without wading through clutter. Whether you're into subbed originals or you'd rather watch dubbed, the goal is the same: make it easy to find what you want and get straight to enjoying it.
        </p>
        <p className="text-gray-400 leading-[1.7] mb-6 text-[15.5px]">
          No paywalls, no forced accounts just to browse, no fifteen redirects before you reach a working link. Just a clean layout built around the content.
        </p>

        <div className="h-px bg-white/10 my-12" />

        <h3 className="text-2xl font-bold text-white border-l-4 border-primary pl-3.5 mb-3.5">
          Why Trust Us
        </h3>
        <p className="text-gray-400 leading-[1.7] mb-4 text-[15.5px]">
          Fair question — there are a lot of shady corners of the internet built around "free" anime. Here's the short version of how we're different:
        </p>
        <ul className="space-y-2 mb-6">
          {[
            'No hidden costs — nothing here is gated behind a surprise subscription',
            'No spammy pop-ups hijacking your browser — clean pages, not ad minefields',
            'Built by fans, for fans — this isn\'t a content farm, it\'s run by people who actually watch this stuff',
          ].map((point) => (
            <li key={point} className="text-gray-400 text-[15.5px] leading-relaxed flex gap-2">
              <span className="text-primary mt-1 shrink-0">&mdash;</span>
              {point}
            </li>
          ))}
        </ul>

        <div className="h-px bg-white/10 my-12" />

        <h3 className="text-2xl font-bold text-white border-l-4 border-primary pl-3.5 mb-3.5">
          What You'll Find Here
        </h3>
        <ul className="space-y-2 mb-6">
          {[
            'Recommendations sorted by genre, mood, or vibe',
            'News on upcoming releases and seasonal lineups',
            'Reviews and breakdowns of new and classic series',
            'Occasional deep-dives into the shows and moments that hit hardest',
          ].map((text) => (
            <li key={text} className="text-gray-400 text-[15.5px] leading-relaxed flex gap-2">
              <span className="text-primary mt-1 shrink-0">&mdash;</span>
              {text}
            </li>
          ))}
        </ul>

        <div className="h-px bg-white/10 my-12" />

        <h3 className="text-2xl font-bold text-white border-l-4 border-primary pl-3.5 mb-3.5">
          A Quick Note
        </h3>
        <p className="text-gray-400 leading-[1.7] text-[15.5px]">
          This is a passion project first. It'll keep evolving as it grows, and feedback is always welcome — if something's broken, confusing, or missing, say so. Thanks for stopping by. Grab some tea, pick a series, and enjoy.
        </p>

        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm italic">Made by fans, for fans.</p>
        </div>
      </section>
    </div>
  )
}
