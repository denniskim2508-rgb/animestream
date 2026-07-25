export function getEpisodeUrl(anilistId, episode, total, audioMode) {
  return `/watch/${anilistId}/${episode}?total=${total}&audio=${audioMode}`
}
