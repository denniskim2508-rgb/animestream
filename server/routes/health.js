import { Router } from 'express'
import { snapshot, summarize } from '../utils/stats.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Animestream server' })
})

// Diagnostics: per-provider stats + slow/unstable/degraded flags so a quick
// curl surfaces which upstreams are unhealthy.
router.get('/health/providers', (_req, res) => {
  res.json({ providers: snapshot(), summary: summarize() })
})

export default router
