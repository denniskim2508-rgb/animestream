import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
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
// Render sits behind a proxy that sets X-Forwarded-For; trusting one hop keeps
// rate limits keyed to real client IPs instead of the proxy's address.
app.set('trust proxy', 1)

// Basic security headers (the client is a SPA, so no CSP inline policies here).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// ── Rate limiting ─────────────────────────────────────────────
// Limits are tunable via env (e.g. RATE_LIMIT_GLOBAL) so they can be adjusted
// on Render without a code change.
const int = (v, d) => { const n = parseInt(process.env[v], 10); return Number.isFinite(n) && n > 0 ? n : d }
const MINUTE = 60 * 1000
const RATE_LIMIT_MESSAGE = { error: 'Too many requests. Please slow down and try again.' }
const limiterOpts = { windowMs: MINUTE, standardHeaders: 'draft-7', legacyHeaders: false, message: RATE_LIMIT_MESSAGE }

// Global API guard (health checks are infrequent, so keep it generous).
// Media segment passthrough is excluded here and limited separately so long
// playback sessions don't trip the global window.
const globalLimiter = rateLimit({
  ...limiterOpts,
  limit: int('RATE_LIMIT_GLOBAL', 1000),
  skip: (req) => req.originalUrl.startsWith('/api/media/proxy'),
})

// LLM-backed resolver is expensive per call; tight per-IP budget.
const adaptationLimiter = rateLimit({ ...limiterOpts, limit: int('RATE_LIMIT_ADAPTATION', 10) })

// Provider stream resolution (per episode) — keep bursty seek/retry behavior sane.
const streamLimiter = rateLimit({ ...limiterOpts, limit: int('RATE_LIMIT_STREAM', 60) })

// m3u8 + segment passthrough: high volume by design (~10 req/min per stream),
// so only cap runaway abuse.
const mediaProxyLimiter = rateLimit({ ...limiterOpts, limit: int('RATE_LIMIT_MEDIA', 600) })

app.use('/api', globalLimiter)
app.use('/api/manga/adaptation', adaptationLimiter)
app.use('/api/stream', streamLimiter)
app.use('/api/media/proxy', mediaProxyLimiter)

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
