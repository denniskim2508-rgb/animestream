import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import animeRoutes from './server/routes/anime.js'
import mangaRoutes from './server/routes/manga.js'
import mediaRoutes from './server/routes/media.js'
import healthRoutes from './server/routes/health.js'
import { summarize } from './server/utils/stats.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())

// ── Routers ────────────────────────────────────────────────────
// anime  → /api/anidap/*, /api/stream/*, /api/anime/home
// manga  → /api/manga/* (Provider Manager + cache service)
// media  → /api/media/proxy (m3u8 + segment passthrough)
// health → /api/health, /api/health/providers
app.use('/api', animeRoutes)
app.use('/api/manga', mangaRoutes)
app.use('/api', mediaRoutes)
app.use('/api', healthRoutes)

// ── Serve built frontend ──────────────────────────────────────
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message)
})
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled rejection:', err?.message || err)
})

// ── Provider health digest ────────────────────────────────────
// Every minute, log a one-line digest flagging slow/unstable/degraded upstreams
// so issues surface in the server log without reading every request line.
setInterval(() => {
  const s = summarize()
  const flags = [
    ...s.slowest.map((p) => `${p.name} slow=${p.slowestMs}ms`),
    ...s.unstable.map((p) => `${p.name} fail=${Math.round((1 - p.successRate / 100) * 100)}%`),
    ...s.degraded.map((p) => `${p.name} last=${p.lastStatus}`),
  ]
  console.log(`[health] ${s.totalCalls} provider calls, ${s.totalFailures} failures | ${flags.length ? flags.join(', ') : 'all stable'}`)
}, 60 * 1000).unref()

const PORT = process.env.PORT || process.env.ANIWATCH_PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
