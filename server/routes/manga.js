import { Router } from 'express'
import * as manga from '../services/mangaService.js'

const router = Router()

// All /api/manga/* routes go through the service layer, which wraps the
// Provider Manager with caching + single-flight. The frontend only ever sees
// normalized shapes and opaque ids like "mangadex:<uuid>" / "allmanga:<ref>".

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
    const { data, total, provider } = await manga.search(q, Number(limit), Number(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] search error:', err.message)
    res.status(502).json({ error: 'Failed to search manga' })
  }
})

router.get('/trending', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const { data, total, provider } = await manga.trending(Number(limit), Number(offset))
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] trending error:', err.message)
    res.status(502).json({ error: 'Failed to fetch trending manga' })
  }
})

router.get('/latest', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query
    const { data, total, provider } = await manga.latest(Number(limit), Number(offset))
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
    const { data, total, provider } = await manga.chapters(req.params.id, lang, Number(limit), Number(offset))
    console.log(`[manga] chapters | mangaId=${req.params.id} | provider=${provider} | total=${total} | returned=${data.length}`)
    res.json({ data, total, provider })
  } catch (err) {
    console.error('[manga] chapters error:', err.message)
    res.status(502).json({ error: 'Failed to fetch chapters' })
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
