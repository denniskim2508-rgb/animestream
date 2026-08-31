import { Router } from 'express'
import { snapshot, summarize } from '../utils/stats.js'
import { anilistGraphQL, HEALTH_QUERY } from '../services/anilistClient.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Animestream server' })
})

// Diagnostics: per-provider stats + classification + attention flags so a quick
// curl surfaces which upstreams are unhealthy and why (status, error code, text).
router.get('/health/providers', (_req, res) => {
  res.json({ providers: snapshot(), summary: summarize() })
})

// Single-provider detail: full stats + classification for one upstream.
router.get('/health/providers/:name', (req, res) => {
  const p = snapshot().find((s) => s.name === req.params.name)
  if (!p) return res.status(404).json({ error: `unknown provider: ${req.params.name}` })
  res.json(p)
})

// Force a live probe of AniList. Records into the same stats as any real
// request (so the snapshot and the minute digest reflect it immediately), then
// returns the probe result plus a fresh providers snapshot so the admin
// dashboard can refresh in a single round-trip. This is how ops verifies an
// AniList fix without waiting for organic traffic.
router.post('/health/providers/probe', async (_req, res) => {
  const start = Date.now()
  let ok = false
  let error = null
  try {
    await anilistGraphQL(HEALTH_QUERY, {}, 'probe')
    ok = true
  } catch (err) {
    error = err.message
  }
  res.json({
    probe: { provider: 'anilist', ok, ms: Date.now() - start, error },
    providers: snapshot(),
  })
})

export default router
