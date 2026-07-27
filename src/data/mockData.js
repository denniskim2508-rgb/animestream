const GENRE_COLORS = {
  action: '#ef4444',
  adventure: '#f97316',
  comedy: '#f59e0b',
  drama: '#ec4899',
  ecchi: '#f43f5e',
  fantasy: '#8b5cf6',
  horror: '#dc2626',
  mahoushoujo: '#d946ef',
  mecha: '#06b6d4',
  music: '#10b981',
  mystery: '#6366f1',
  psychological: '#7c3aed',
  romance: '#ec4899',
  scifi: '#0ea5e9',
  sliceoflife: '#22c55e',
  sports: '#14b8a6',
  supernatural: '#a855f7',
  thriller: '#ef4444',
}

const GENRE_ICONS = {
  action: '⚔️',
  adventure: '🗺️',
  comedy: '😂',
  drama: '🎭',
  ecchi: '🔥',
  fantasy: '🔮',
  horror: '👻',
  mahoushoujo: '✨',
  mecha: '🤖',
  music: '🎵',
  mystery: '🔍',
  psychological: '🧠',
  romance: '💕',
  scifi: '🚀',
  sliceoflife: '🌸',
  sports: '⚽',
  supernatural: '👁️',
  thriller: '🔪',
}

const GENRE_IMAGES = {
  action: '/genre-images/action.jpg',
  adventure: '/genre-images/adventure.jpg',
  comedy: '/genre-images/comedy.jpg',
  drama: '/genre-images/drama.jpg',
  ecchi: '/genre-images/ecchi.jpg',
  fantasy: '/genre-images/fantasy.jpg',
  horror: '/genre-images/horror.jpg',
  mahoushoujo: '/genre-images/mahoushoujo.jpg',
  mecha: '/genre-images/mecha.jpg',
  music: '/genre-images/music.jpg',
  mystery: '/genre-images/mystery.jpg',
  psychological: '/genre-images/psychological.jpg',
  romance: '/genre-images/romance.jpg',
  scifi: '/genre-images/scifi.jpg',
  sliceoflife: '/genre-images/sliceoflife.jpg',
  sports: '/genre-images/sports.jpg',
  supernatural: '/genre-images/supernatural.jpg',
  thriller: '/genre-images/thriller.jpg',
}

const GENRE_NAMES = {
  action: 'Action',
  adventure: 'Adventure',
  comedy: 'Comedy',
  drama: 'Drama',
  ecchi: 'Ecchi',
  fantasy: 'Fantasy',
  horror: 'Horror',
  mahoushoujo: 'Mahou Shoujo',
  mecha: 'Mecha',
  music: 'Music',
  mystery: 'Mystery',
  psychological: 'Psychological',
  romance: 'Romance',
  scifi: 'Sci-Fi',
  sliceoflife: 'Slice of Life',
  sports: 'Sports',
  supernatural: 'Supernatural',
  thriller: 'Thriller',
}

export function getGenreColor(name) {
  return GENRE_COLORS[name.toLowerCase().replace(/ /g, '')] || '#6b7280'
}

export function getGenreIcon(name) {
  return GENRE_ICONS[name.toLowerCase().replace(/ /g, '')] || '🎬'
}

export function getAllGenres() {
  return Object.keys(GENRE_COLORS).map((id) => ({
    id,
    name: GENRE_NAMES[id] || id,
    color: GENRE_COLORS[id],
    icon: GENRE_ICONS[id],
    image: GENRE_IMAGES[id] || '',
  }))
}

export function getStatusLabel(status) {
  switch (status) {
    case 'RELEASING': return 'Airing'
    case 'FINISHED': return 'Completed'
    case 'NOT_YET_RELEASED': return 'Upcoming'
    case 'CANCELLED': return 'Cancelled'
    case 'HIATUS': return 'Hiatus'
    default: return status
  }
}

export function getFormatLabel(format) {
  switch (format) {
    case 'TV': return 'TV'
    case 'MOVIE': return 'Movie'
    case 'OVA': return 'OVA'
    case 'ONA': return 'ONA'
    case 'SPECIAL': return 'Special'
    case 'TV_SHORT': return 'TV Short'
    case 'MUSIC': return 'Music'
    case 'NOVEL': return 'Novel'
    default: return format || 'TV'
  }
}
