import { Router } from 'express'
import * as manga from '../services/mangaService.js'
import * as adaptation from '../services/adaptationService.js'
import * as resolver from '../services/adaptationResolver.js'
import { cache } from '../cache/memoryCache.js'
import { verifyFirebaseToken, bearerToken, aiResolverQuotaExceeded } from '../utils/firebaseAuth.js'

const router = Router()

// Memoize resolver outcomes so a cache miss is attempted once and the verdict
// (saved or "couldn't determine") is reused instead of re-running the LLM.
// Failures are cached for an hour; successes live in the persistent store.
const RESOLVER_CACHE = cache('manga:adaptation:resolver', { ttlMs: 60 * 60 * 1000, maxEntries: 200 })

// The AI resolver only runs for authenticated users under a per-user daily
// budget, so anonymous visitors can't drain OpenAI credits. The quota is
// counted inside the cached() callback, i.e. only on an actual LLM attempt
// (cache hits for the same input don't consume the budget).
async function resolveForRequest(animeId, episode, uid) {
  if (!resolver.resolverEnabled()) return null
  const key = `${animeId}:${episode}`
  return RESOLVER_CACHE.cached(key, async () => {
    if (aiResolverQuotaExceeded(uid)) {
      const err = new Error('daily AI resolver quota exceeded')
      err.code = 'AI_QUOTA'
      throw err
    }
    return resolver.resolveAdaptation(animeId, episode)
  })
}

// All /api/manga/* routes go through the service layer, which wraps the
// Provider Manager with caching + single-flight. The frontend only ever sees
// normalized shapes and opaque ids like "mangadex:<uuid>" / "allmanga:<ref>".

// Pagination is clamped so a client can't trigger oversized upstream fetches.
const clampInt = (v, min, max, dflt) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), min), max) : dflt
}
const LIMIT = (v) => clampInt(v, 1, 100, 20)
const OFFSET = (v) => clampInt(v, 0, 10000, 0)

router.get('/lookup', async (req, res) => {
  try {
    const titles = [].concat(req.query.titles || [])
      .map((s) => String(s).trim())
      .filter(Boolean)
    if (!titles.length) return res.status(400).json({ error: 'titles is required' })
    const strict = req.query.strict === '1'
    const { data, provider } = await manga.lookup(titles, strict)
    res.json({ data, provider })
  } catch (err) {
    console.error('[manga] lookup error:', err.message)
    res.status(502).json({ error: 'Failed to lookup manga' })
  }
})

router.get('/search', async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query
    if (!q) return res.status(400).json({ error: 'q is required' })
    const { data, total, provider } = await manga.search(q, LIMIT(limit), OFFSET(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] search error:', err.message)
    res.status(502).json({ error: 'Failed to search manga' })
  }
})

router.get('/trending', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const { data, total, provider } = await manga.trending(LIMIT(limit), OFFSET(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] trending error:', err.message)
    res.status(502).json({ error: 'Failed to fetch trending manga' })
  }
})

router.get('/latest', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const { data, total, provider } = await manga.latest(LIMIT(limit), OFFSET(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] latest error:', err.message)
    res.status(502).json({ error: 'Failed to fetch latest manga' })
  }
})

router.get('/random', async (_req, res) => {
  try {
    const { data, provider } = await manga.random()
    res.json({ data, provider })
  } catch (err) {
    console.error('[manga] random error:', err.message)
    res.status(502).json({ error: 'Failed to fetch random manga' })
  }
})

router.get('/chapter/:id', async (req, res) => {
  try {
    const chapterId = req.params.id
    const { manga: mangaId, num } = req.query
    const pageData = await manga.pages(chapterId, {
      mangaId,
      chapterNum: num != null ? Number(num) : undefined,
    })
    const provider = pageData.provider || manga.splitId(chapterId).provider
    console.log(
      `[manga] chapter pages | id=${chapterId} | provider=${provider} | pages=${pageData.pages?.length ?? 0} | pagesSd=${pageData.pagesSd?.length ?? 0}`
    )
    for (const [i, u] of (pageData.pages || []).entries()) {
      console.log(`[manga]   page[${i}] ${u}`)
    }
    res.json(pageData)
  } catch (err) {
    console.error('[manga] chapter pages error:', err.message)
    res.status(502).json({ error: 'Failed to fetch chapter pages' })
  }
})

router.get('/:id/chapters', async (req, res) => {
  try {
    const { lang = 'en', limit = 100, offset = 0 } = req.query
    const { data, total, provider } = await manga.chapters(req.params.id, lang, LIMIT(limit), OFFSET(offset))
    console.log(`[manga] chapters | mangaId=${req.params.id} | provider=${provider} | total=${total} | returned=${data.length}`)
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] chapters error:', err.message)
    res.status(502).json({ error: 'Failed to fetch chapters' })
  }
})

// Must be registered before /:id so "adaptation" isn't treated as a manga id.
// Maps a watched anime episode to the next chapter to read in the manga.
router.get('/adaptation', async (req, res) => {
  try {
    const { animeId, episode } = req.query
    if (animeId == null || episode == null) {
      return res.status(400).json({ error: 'animeId and episode are required' })
    }
    if (!/^\d{1,9}$/.test(String(animeId)) || !/^\d{1,9}$/.test(String(episode))) {
      return res.status(400).json({ error: 'invalid animeId or episode' })
    }
    const { result, notFound, source } = adaptation.getAdaptation(animeId, episode)
    if (!notFound) {
      console.log(
        `[manga] adaptation | animeId=${result.animeId} | episode=${result.episode} | series=${result.series} | filler=${result.filler} | lastAdaptedChapter=${result.lastAdaptedChapter ?? '-'} | nextChapter=${result.nextChapter} | source=${source || 'map'}`
      )
      return res.json({ ...result, source: source || 'map' })
    }

    // Map + store both missed: fall through to the AI resolver only if a key is
    // configured AND the caller is signed in (under a per-user daily budget),
    // to stop anonymous visitors from draining OpenAI credits. A high-confidence
    // answer is saved to the store, so the next request hits the cache;
    // anything else is refused rather than guessing.
    if (!resolver.resolverEnabled()) {
      console.log(`[manga] adaptation | animeId=${animeId} | episode=${episode} | ${notFound}`)
      return res.status(404).json({ error: notFound === 'unknown-anime' ? 'Unknown animeId' : 'Episode not in adaptation map' })
    }

    const uid = await verifyFirebaseToken(bearerToken(req))
    if (!uid) {
      return res.status(401).json({ error: 'auth-required', message: 'Sign in to get AI-powered adaptation suggestions.' })
    }

    let outcome
    try {
      outcome = await resolveForRequest(animeId, episode, uid)
    } catch (err) {
      if (err.code === 'AI_QUOTA') {
        return res.status(429).json({ error: 'ai-quota', message: 'Daily AI adaptation limit reached. Try again tomorrow.' })
      }
      throw err
    }

    if (outcome?.ok) {
      adaptation.saveAdaptation(animeId, episode, {
        nextChapter: outcome.result.nextChapter,
        lastAdaptedChapter: outcome.result.lastAdaptedChapter,
        filler: outcome.result.filler,
        animeTitle: outcome.result.animeTitle,
        source: `ai:${outcome.confidence}`,
      })
      console.log(
        `[manga] adaptation | animeId=${animeId} | episode=${episode} | saved via AI resolver (confidence=${outcome.confidence}, nextChapter=${outcome.result.nextChapter ?? 'none'})`
      )
      return res.json({ ...outcome.result, source: 'store' })
    }

    if (outcome) {
      console.log(`[manga] adaptation | animeId=${animeId} | episode=${episode} | ${outcome.message} (confidence=${outcome.confidence ?? 'n/a'})`)
      return res.status(404).json({ error: 'unknown-anime', message: outcome.message })
    }

    console.log(`[manga] adaptation | animeId=${animeId} | episode=${episode} | ${notFound}`)
    return res.status(404).json({ error: notFound === 'unknown-anime' ? 'Unknown animeId' : 'Episode not in adaptation map' })
  } catch (err) {
    console.error('[manga] adaptation error:', err.message)
    res.status(502).json({ error: 'Failed to resolve adaptation' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { data, provider } = await manga.detail(req.params.id)
    res.json({ data, provider })
  } catch (err) {
    console.error('[manga] details error:', err.message)
    res.status(502).json({ error: 'Failed to fetch manga details' })
  }
})

export default router
