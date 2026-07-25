import { Link } from 'react-router-dom'
import { Film, Globe, MessageCircle, Play, Rss } from 'lucide-react'
import { getAllGenres } from '../../data/mockData'

export default function Footer() {
  return (
    <footer className="bg-surface border-t border-white/5 mt-20">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <Link to="/home" className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Film className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">
                <span className="text-gradient">Kaisen</span>
                <span className="text-white"> X Anime</span>
              </span>
            </Link>
            <p className="text-sm text-gray-400 mb-4 max-w-xs">
              Your premium destination for anime streaming. Watch thousands of titles in HD and 4K.
            </p>
            <div className="flex items-center gap-3">
              {[MessageCircle, Globe, Play, Rss].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Browse</h4>
            <ul className="space-y-2">
              {['Trending', 'Top Rated', 'New Releases', 'Recently Updated'].map((item) => (
                <li key={item}>
                  <Link to="/browse" className="text-sm text-gray-400 hover:text-white transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Genres</h4>
            <ul className="space-y-2">
              {getAllGenres().slice(0, 6).map((g) => (
                <li key={g.id}>
                  <Link to={`/genres/${g.id}`} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {g.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Account</h4>
            <ul className="space-y-2">
              {[
                { label: 'Profile', to: '/profile' },
                { label: 'Help Center', to: '/' },
                { label: 'About', to: '/about' },
                { label: 'Terms of Service', to: '/' },
                { label: 'Privacy Policy', to: '/' },
              ].map((item) => (
                <li key={item.label}>
                  <Link to={item.to} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; 2025 Kaisen X Anime. All rights reserved.
          </p>
          <p className="text-xs text-gray-600">
            This is a demo project. No real content is streamed.
          </p>
        </div>
      </div>
    </footer>
  )
}
