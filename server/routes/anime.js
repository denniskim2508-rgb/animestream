import { Router } from 'express'
import {
  getAnimeDetails,
  searchAnidap,
  getEpisodes,
  getServers,
  getSources,
  getRecents,
  checkAvailability,
  resolveStream,
  fetchHome,
} from '../services/animeService.js'

const router = Router()

router.get('/anidap/anime/:anilistId', async (req, res) => {
  try {
    res.json(await getAnimeDetails(req.params.anilistId))
  } catch (err) {
    console.error('[anidap] details error:', err.message)
    res.status(502).json({ error: 'Failed to fetch anime details' })
  }
})

router.get('/anidap/search', async (req, res) => {
  const q = req.query.q
  if (!q) return res.status(400).json({ error: 'q is required' })
  try {
    res.json(await searchAnidap(q))
  } catch (err) {
    console.error('[anidap] search error:', err.message)
    res.status(502).json({ error: 'Failed to search' })
  }
})

router.get('/anidap/episodes/:slug', async (req, res) => {
  try {
    res.json(await getEpisodes(req.params.slug))
  } catch (err) {
    console.error('[anidap] episodes error:', err.message)
    res.status(502).json({ error: 'Failed to fetch episodes' })
  }
})

router.get('/anidap/servers/:slug/:epNum', async (req, res) => {
  try {
    res.json(await getServers(req.params.slug, req.params.epNum))
  } catch (err) {
    console.error('[anidap] servers error:', err.message)
    res.status(502).json({ error: 'Failed to fetch servers' })
  }
})

router.get('/anidap/sources/:slug/:epNum/:type/:providerId', async (req, res) => {
  try {
    const { slug, epNum, type, providerId } = req.params
    res.json(await getSources(slug, epNum, type, providerId))
  } catch (err) {
    console.error('[anidap] sources error:', err.message)
    res.status(502).json({ error: 'Failed to fetch sources' })
  }
})

router.get('/anidap/recents', async (_req, res) => {
  try {
    res.json(await getRecents())
  } catch (err) {
    console.error('[anidap] recents error:', err.message)
    res.status(502).json({ error: 'Failed to fetch recents' })
  }
})

// Takes anilistId + ep + type, finds slug, gets sources, returns m3u8
router.get('/stream/availability', async (req, res) => {
  const { anilistId, episode } = req.query
  if (!anilistId || !episode) {
    return res.status(400).json({ error: 'anilistId and episode are required' })
  }
  res.json(await checkAvailability(anilistId, episode))
})

router.get('/stream/resolve', async (req, res) => {
  const { anilistId, episode, audio } = req.query
  if (!anilistId || !episode) {
    return res.status(400).json({ error: 'anilistId and episode are required' })
  }
  try {
    res.json(await resolveStream({ anilistId, episode, audio }))
  } catch (err) {
    console.error('[stream] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Provider fallback: try sources with a different provider
router.get('/stream/sources', async (req, res) => {
  const { slug, ep, type, providerId } = req.query
  if (!slug || !ep || !providerId) {
    return res.status(400).json({ error: 'slug, ep, and providerId are required' })
  }
  try {
    const data = await getSources(slug, ep, type || 'sub', providerId)
    res.json({
      sources: data.sources || [],
      headers: data.headers || {},
      tracks: data.tracks || [],
      chapters: data.chapters || [],
    })
  } catch (err) {
    console.error('[stream] sources error:', err.message)
    res.status(502).json({ error: 'Failed to fetch sources' })
  }
})

// Cached AniList homepage data (raw media nodes; the client normalizes them)
router.get('/anime/home', async (req, res) => {
  try {
    res.json(await fetchHome(req.query.perPage))
  } catch (err) {
    console.error('[anime] home error:', err.message)
    res.status(502).json({ error: 'Failed to fetch homepage data' })
  }
})

export default router
