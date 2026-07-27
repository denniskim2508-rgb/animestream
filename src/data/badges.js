export const BADGES = {
  firstEpisode: { icon: '🎬', name: 'First Episode', description: 'Watch your first episode' },
  bingeWatcher: { icon: '🍿', name: 'Binge Watcher', description: 'Watch 50 episodes' },
  centuryClub: { icon: '💯', name: 'Century Club', description: 'Watch 100 episodes' },
  animeVeteran: { icon: '👑', name: 'Anime Veteran', description: 'Watch 500 episodes' },
  firstComment: { icon: '💬', name: 'First Comment', description: 'Post your first comment' },
  topCommenter: { icon: '🔥', name: 'Top Commenter', description: '100 comments posted' },
  communityFavorite: { icon: '❤️', name: 'Community Favorite', description: 'Receive 500 likes' },
  superFan: { icon: '⭐', name: 'Super Fan', description: 'Favourite 50 anime' },
  collector: { icon: '📚', name: 'Collector', description: 'Add 100 anime to Watchlist' },
}

export function checkBadges(user, stats) {
  const earned = [...(user.badges || [])]
  const newBadges = []
  const watchCount = (stats?.episodesWatched || user.watchMinutes || 0) > 0
    ? Math.round((user.watchMinutes || 0) / 24)
    : 0
  const commentCount = stats?.commentsPosted || 0
  const likeCount = stats?.likesReceived || 0
  const favCount = Array.isArray(user.favorites) ? user.favorites.length : 0
  const wlCount = Array.isArray(user.watchlist) ? user.watchlist.length : 0

  const checks = {
    firstEpisode: watchCount >= 1,
    bingeWatcher: watchCount >= 50,
    centuryClub: watchCount >= 100,
    animeVeteran: watchCount >= 500,
    firstComment: commentCount >= 1,
    topCommenter: commentCount >= 100,
    communityFavorite: likeCount >= 500,
    superFan: favCount >= 50,
    collector: wlCount >= 100,
  }

  for (const [id, met] of Object.entries(checks)) {
    if (met && !earned.includes(id)) {
      earned.push(id)
      newBadges.push(id)
    }
  }
  return { earned, newBadges }
}
