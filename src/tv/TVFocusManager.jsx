import { createContext, useContext, useEffect, useMemo, useRef, useCallback, useReducer } from 'react'

// ── TV spatial navigation engine ─────────────────────────────────────────────
// Region-first D-pad navigation inspired by Android Leanback / dpad v1.2.2.
// Every interactive element registers via useFocusable(). A single window
// keydown handler moves focus using weighted-distance scoring with beam
// preference and region-first traversal. Focus memory is maintained per-region
// and per-route so UP/DOWN always returns to the expected card. Visual focus
// is a CSS class toggled directly on the element (no React re-renders).

const TVFocusContext = createContext(null)
export const TVRegionContext = createContext(null)
// Stage 1: provides a child its parent focusable-container id.
export const TVContainerContext = createContext(null)

// Module-level so focus positions survive route unmounts (not reloads).
const focusMemory = new Map()
// Per-region focus memory: regionId → { id, rect, at }
const regionFocusMemory = new Map()
// Per-container focus memory (Stage 0, additive): containerId → childKey
const containerFocusMemory = new Map()

let uid = 0
const nextId = () => `tvf-${++uid}`

const NAV_KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

// ── Debug logging ──────────────────────────────────────────────────────────
let debugEnabled = false
try { debugEnabled = !!window.__tv_debug } catch { /* ignore */ }
const debugLog = (...args) => { if (debugEnabled) console.log('[TV-DPAD]', ...args) }

// ── Geometry helpers ───────────────────────────────────────────────────────

/** Beam overlap: does the candidate overlap the source on the cross-axis? */
function beamOverlap(from, to, dir) {
  if (dir === 'left' || dir === 'right') {
    return Math.max(0, Math.min(from.r.bottom, to.r.bottom) - Math.max(from.r.top, to.r.top))
  }
  return Math.max(0, Math.min(from.r.right, to.r.right) - Math.max(from.r.left, to.r.left))
}

/**
 * Weighted distance modeled on Android's FocusFinder.
 * `13·major² + minor²` penalises far-away candidates strongly while the
 * cross-axis term breaks ties between nearby neighbours.
 */
function weightedDistance(major, minor) {
  return 13 * major * major + minor * minor
}

/**
 * Score a candidate for directional movement. Lower is better.
 * Returns Infinity when the candidate is geometrically invalid.
 */
function scoreCandidate(from, to, dir, guideX) {
  const fx = from.r.left + from.r.width / 2
  const fy = from.r.top + from.r.height / 2
  const tx = to.r.left + to.r.width / 2
  const ty = to.r.top + to.r.height / 2

  let major
  let minor
  if (dir === 'right') {
    if (to.r.left < from.r.right - 4) return Infinity
    major = to.r.left - from.r.right
    minor = Math.abs(ty - fy)
  } else if (dir === 'left') {
    if (to.r.right > from.r.left + 4) return Infinity
    major = from.r.left - to.r.right
    minor = Math.abs(ty - fy)
  } else if (dir === 'down') {
    if (to.r.top < from.r.bottom - 4) return Infinity
    major = to.r.top - from.r.bottom
    minor = Math.abs(tx - (guideX != null ? guideX : fx))
  } else {
    if (to.r.bottom > from.r.top + 4) return Infinity
    major = from.r.top - to.r.bottom
    minor = Math.abs(tx - (guideX != null ? guideX : fx))
  }

  const overlap = beamOverlap(from, to, dir)
  const inBeam = overlap > 0

  // Weighted distance base score
  const dist = weightedDistance(Math.max(0, major), minor)

  // Beam bonus: in-beam candidates categorically beat out-of-beam candidates.
  // Use a large constant that cannot be overcome by distance differences.
  const BEAM_BONUS = 50000
  return inBeam ? dist - BEAM_BONUS : dist
}

/**
 * Walk up the DOM from `el` and return the nearest ancestor that is a
 * horizontally-scrollable container (overflow-x: auto|scroll with scrollable
 * width). Returns null when the element is not inside a horizontal rail.
 */
function nearestHScrollContainer(el) {
  let cur = el.parentElement
  while (cur && cur !== document.documentElement) {
    const s = window.getComputedStyle(cur)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && cur.scrollWidth > cur.clientWidth + 2) {
      return cur
    }
    cur = cur.parentElement
  }
  return null
}

// ── Auto-scroll helper ─────────────────────────────────────────────────────

/**
 * Scroll every scrollable ancestor so the element is fully visible with
 * padding around it (for focus glow / border). Walks up the DOM and
 * handles both horizontal rails and vertical page scrolling.
 */
function ensureVisible(el, padding = 48) {
  if (!el || !el.isConnected) return
  let current = el.parentElement
  while (current && current !== document.documentElement) {
    const style = window.getComputedStyle(current)
    const overflowX = style.overflowX
    const overflowY = style.overflowY
    const isScrollable =
      (overflowX === 'auto' || overflowX === 'scroll') ||
      (overflowY === 'auto' || overflowY === 'scroll')

    if (isScrollable) {
      const scrollW = current.scrollWidth
      const clientW = current.clientWidth
      const scrollH = current.scrollHeight
      const clientH = current.clientHeight
      const canScrollH = scrollH > clientH + 2
      const canScrollW = scrollW > clientW + 2

      if (canScrollH || canScrollW) {
        const elRect = el.getBoundingClientRect()
        const cRect = current.getBoundingClientRect()

        // Vertical scrolling
        if (canScrollH) {
          const elTop = elRect.top - cRect.top + current.scrollTop
          const elBottom = elTop + elRect.height

          // When the focused element sits inside a compact header-style
          // section (e.g. hero/actions), scroll so the section's top is
          // visible, not just the element. This keeps the full hero (title,
          // metadata, buttons) in the viewport when returning focus from
          // below. Only applies to SHORT sections — long grid sections (the
          // episodes list) must scroll normally tile-by-tile, never re-pin to
          // their top.
          let targetTop = null
          const sec = el.closest('section')
          if (sec && sec !== current && sec.offsetHeight < 800 && sec.offsetHeight >= 400) {
            const secTop = sec.getBoundingClientRect().top - cRect.top + current.scrollTop
            if (secTop - padding < current.scrollTop) {
              targetTop = Math.max(0, secTop - padding)
            }
          }

          if (targetTop != null) {
            current.scrollTop = Math.max(0, targetTop)
          } else if (elTop - padding < current.scrollTop) {
            current.scrollTop = Math.max(0, elTop - padding)
          } else if (elBottom + padding > current.scrollTop + clientH) {
            current.scrollTop = elBottom - clientH + padding
          }
        }

        // Horizontal scrolling
        if (canScrollW) {
          const elLeft = elRect.left - cRect.left + current.scrollLeft
          const elRight = elLeft + elRect.width
          if (elLeft - padding < current.scrollLeft) {
            current.scrollLeft = Math.max(0, elLeft - padding)
          } else if (elRight + padding > current.scrollLeft + clientW) {
            current.scrollLeft = elRight - clientW + padding
          }
        }
      }
    }
    current = current.parentElement
  }
}

/**
 * Focus movement that finds no candidate should still move the page so the
 * user can reach beyond the focusable edge (e.g. UP at the hero's action
 * buttons scrolls back up to reveal more, DOWN at the last grid row reveals
 * more tiles when taller content scrolls). Steps vertically by just under one
 * viewport so a sliver of context stays visible. Returns true if it scrolled.
 */
function scrollOnNoMove(el, dir) {
  if (!el || !el.isConnected) return false
  let current = el.parentElement
  while (current && current !== document.documentElement) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 2) {
      const maxTop = current.scrollHeight - current.clientHeight
      const step = current.clientHeight * 0.85
      const target = dir === 'down' ? Math.min(maxTop, current.scrollTop + step) : Math.max(0, current.scrollTop - step)
      if (target !== current.scrollTop) {
        current.scrollTop = target
        return true
      }
    }
    current = current.parentElement
  }
  return false
}

// ── Provider ───────────────────────────────────────────────────────────────

export function TVFocusProvider({ children }) {
  const registryRef = useRef(new Map())
  // Stage 0 (additive): container registry. containerId → { id, region, elRef,
  // preferredChildKey, exits, children:Set<string>, lastFocusedChild }
  const containersRef = useRef(new Map())
  const scopeStackRef = useRef(['root'])
  const focusedIdRef = useRef(null)
  const listenersRef = useRef(new Set())
  const debugListenersRef = useRef(new Set())

  const notify = useCallback(() => {
    listenersRef.current.forEach((fn) => {
      try { fn() } catch { /* listener errors never break focusing */ }
    })
  }, [])

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn)
    return () => listenersRef.current.delete(fn)
  }, [])

  const setFocusedClass = useCallback((id, on) => {
    const entry = registryRef.current.get(id)
    const el = entry && entry.elRef.current
    if (!el) return
    el.classList.toggle('tv-focused', on)
    el.setAttribute('data-tv-focused', on ? 'true' : 'false')
  }, [])

  /** Record which element was last focused inside its region. */
  const updateRegionMemory = useCallback((id) => {
    const entry = registryRef.current.get(id)
    if (!entry) return
    const region = entry.regionRef.current
    if (!region) return
    const el = entry.elRef.current
    if (!el) return
    regionFocusMemory.set(region, {
      id,
      rect: el.getBoundingClientRect(),
      at: Date.now(),
    })
  }, [])

  // ── Stage 0 (additive): container registry helpers ───────────────────────
  // These build the focusable-tree metadata and per-container focus memory.
  // They do NOT change navigation behavior yet — the global geometry passes in
  // moveFocus() are untouched. Later stages read this data to scope searches.

  const registerContainer = useCallback((id, cfg) => {
    const prev = containersRef.current.get(id)
    containersRef.current.set(id, {
      id,
      region: cfg?.region ?? prev?.region ?? null,
      elRef: cfg?.elRef ?? prev?.elRef ?? null,
      preferredChildKey: cfg?.preferredChildKey ?? prev?.preferredChildKey ?? null,
      exits: cfg?.exits ?? prev?.exits ?? {},
      // Directions for which a declared exit takes priority over sibling
      // traversal (e.g. the navbar's DOWN goes straight to content).
      exitFirst: cfg?.exitFirst ?? prev?.exitFirst ?? [],
      children: prev?.children ?? new Set(),
      lastFocusedChild: prev?.lastFocusedChild ?? null,
    })
  }, [])

  /** Update a container's config without disturbing its children/memory. */
  const updateContainer = useCallback((id, cfg) => {
    const c = containersRef.current.get(id)
    if (!c) return
    if (cfg.region !== undefined) c.region = cfg.region
    if (cfg.elRef !== undefined) c.elRef = cfg.elRef
    if (cfg.preferredChildKey !== undefined) c.preferredChildKey = cfg.preferredChildKey
    if (cfg.exits !== undefined) c.exits = cfg.exits
    if (cfg.exitFirst !== undefined) c.exitFirst = cfg.exitFirst
  }, [])

  const unregisterContainer = useCallback((id) => {
    containersRef.current.delete(id)
  }, [])

  const addNodeToContainer = useCallback((containerId, nodeId) => {
    const c = containersRef.current.get(containerId)
    if (c) c.children.add(nodeId)
  }, [])

  const removeNodeFromContainer = useCallback((containerId, nodeId) => {
    const c = containersRef.current.get(containerId)
    if (c) {
      c.children.delete(nodeId)
      if (c.lastFocusedChild === nodeId) c.lastFocusedChild = null
    }
  }, [])

  /** Record which child was last focused inside each ancestor container. */
  const updateContainerMemory = useCallback((nodeId) => {
    const entry = registryRef.current.get(nodeId)
    if (!entry) return
    let parentId = entry.containerRef?.current || null
    let guard = 0
    while (parentId && guard++ < 32) {
      const c = containersRef.current.get(parentId)
      if (!c) break
      c.lastFocusedChild = nodeId
      const parentEntry = registryRef.current.get(parentId)
      parentId = parentEntry?.containerRef?.current || null
    }
  }, [])

  const applyFocus = useCallback((id, scroll = true) => {
    const entry = registryRef.current.get(id)
    const el = entry && entry.elRef.current
    if (!el || !el.isConnected || entry.disabledRef.current) return false
    if (focusedIdRef.current && focusedIdRef.current !== id) setFocusedClass(focusedIdRef.current, false)
    focusedIdRef.current = id
    el.classList.add('tv-focused')
    el.setAttribute('data-tv-focused', 'true')
    try { el.focus({ preventScroll: true }) } catch { /* older engines */ }
    if (scroll) ensureVisible(el)
    updateRegionMemory(id)
    updateContainerMemory(id)
    notify()
    return true
  }, [setFocusedClass, notify, updateRegionMemory, updateContainerMemory])

  const eligible = useCallback(() => {
    const top = scopeStackRef.current[scopeStackRef.current.length - 1]
    const out = []
    registryRef.current.forEach((entry, id) => {
      if (entry.scopeRef.current !== top) return
      if (entry.disabledRef.current) return
      const el = entry.elRef.current
      if (!el || !el.isConnected) return
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      out.push({ id, el, r, region: entry.regionRef.current, entry: entry.entryRef.current, container: entry.containerRef?.current || null, exit: entry.exitRef?.current || null })
    })
    return out
  }, [])

  /** Find the best candidate from a pool using weighted distance + beam. */
  const findBest = useCallback((cur, pool, dir, guideX) => {
    let best = null
    let bestScore = Infinity
    for (const cand of pool) {
      if (cand.id === cur.id) continue
      const s = scoreCandidate(cur, cand, dir, guideX)
      if (s < bestScore) {
        bestScore = s
        best = cand
      }
    }
    return best
  }, [])

  // Vertical-walk column memory: set when an up/down run starts, cleared on
  // any horizontal move so a new walk re-anchors to the new card.
  const vDirRunRef = useRef(false)
  const guideXRef = useRef(null)

  // Deterministic membership: a container's focusables are the registered nodes
  // whose containerRef points at it. Derived from the node registry on demand —
  // NOT from a separately-populated Set — so registration order can never drop
  // children (the Stage 1 root cause).
  const containerMemberIds = useCallback((containerId) => {
    const ids = []
    registryRef.current.forEach((entry, id) => {
      if (entry.containerRef?.current === containerId) ids.push(id)
    })
    return ids
  }, [])

  // Resolve a declared exit destination (leaf focusKey or container id) to a
  // concrete focusable node id. For a container destination, prefer its
  // remembered child, then its preferred child, then its first child —
  // mirroring Norigin's getNextFocusKey memory/preferred/first-child routing.
  const resolveDestination = useCallback((dest, pool, memberIdsOf = null) => {
    if (!dest) return null
    const asNode = pool.find((c) => c.id === dest)
    if (asNode) return asNode.id
    const container = containersRef.current.get(dest)
    if (!container) return null
    for (const candidateKey of [container.lastFocusedChild, container.preferredChildKey]) {
      if (!candidateKey) continue
      const c = pool.find((p) => p.id === candidateKey)
      if (c) return c.id
    }
    const memberIds = (memberIdsOf || containerMemberIds)(container.id)
    if (memberIds.length) {
      const first = pool.find((p) => memberIds.includes(p.id))
      if (first) return first.id
    }
    return null
  }, [containerMemberIds])

  // Stage 1: deterministic navigation for nodes that belong to a focusable
  // container. Searches the current container's siblings in `dir` first, then
  // consults the container's declared exit. Returns true when handled.
  const resolveContainerNav = useCallback((cur, dir, pool, guideX) => {
    const container = cur.container ? containersRef.current.get(cur.container) : null
    if (!container) return false
    const doca = dir // 'down'||'up'||'left'||'right'
    const exitFirst = Array.isArray(container.exitFirst) && container.exitFirst.includes(doca)

    const tryExit = () => {
      const exitDest = container.exits && container.exits[doca]
      if (!exitDest) return false
      const destId = resolveDestination(exitDest, pool)
      if (destId) {
        debugLog(`container exit=${exitDest} -> ${destId} (${cur.container} · ${dir})`)
        applyFocus(destId)
        return true
      }
      return false
    }

    const trySibling = () => {
      const memberIds = containerMemberIds(container.id)
      if (!memberIds.length) return false
      const sibPool = pool.filter((c) => memberIds.includes(c.id) && c.id !== cur.id)
      const bestSib = findBest(cur, sibPool, doca, guideX)
      if (bestSib) {
        debugLog(`container sibling=${bestSib.id} (${cur.container} · ${dir})`)
        applyFocus(bestSib.id)
        return true
      }
      return false
    }

    // Exit-first directions (e.g. navbar DOWN → content) take priority.
    if (exitFirst) {
      if (tryExit()) return true
      if (trySibling()) return true
      return true // no exit resolved → stay
    }

    // 1. Intra-container sibling first.
    if (trySibling()) return true
    // 2. Declared container exit.
    if (tryExit()) return true

    // 3. Container edge with no exit — stay on the current node.
    debugLog(`container boundary - stay (${cur.container} · ${dir})`)
    return true
  }, [findBest, applyFocus, resolveDestination, containerMemberIds])

  const moveFocus = useCallback((dir) => {
    const pool = eligible()
    if (!pool.length) return
    if (!focusedIdRef.current) {
      applyFocus(pool[0].id)
      return
    }
    const cur = pool.find((c) => c.id === focusedIdRef.current)
    if (!cur) {
      applyFocus(pool[0].id)
      return
    }

    // Column memory for vertical navigation
    let guideX = null
    if (dir === 'up' || dir === 'down') {
      if (!vDirRunRef.current) {
        vDirRunRef.current = true
        guideXRef.current = cur.r.left + cur.r.width / 2
      }
      guideX = guideXRef.current
    } else {
      vDirRunRef.current = false
      guideXRef.current = null
    }

    const curRegion = cur.region
    debugLog(`current=${cur.id} dir=${dir} region=${curRegion || 'none'}`)

    // ── Stage 1: per-node explicit exit (highest priority) ──
    // A node may declare a directional exit (e.g. first-card LEFT → navbar,
    // hero DOWN → trending). An explicit exit always wins over geometry. When
    // declared but unresolvable (target page not mounted), we consume the key
    // (stay) rather than let geometry pick an unrelated target.
    const nodeExit = cur.exit && cur.exit[dir]
    if (nodeExit) {
      const destId = resolveDestination(nodeExit, pool, containerMemberIds)
      if (destId) {
        debugLog(`node exit=${nodeExit} -> ${destId} (${cur.id} · ${dir})`)
        applyFocus(destId)
        return
      }
      debugLog(`node exit=${nodeExit} unresolvable - stay (${cur.id} · ${dir})`)
      return
    }

    // ── Stage 1: deterministic container navigation ──
    // If the focused node belongs to a focusable container (navbar, a TVRow,
    // the hero), resolve navigation locally: sibling -> container exit ->
    // stay. This makes first-card LEFT→navbar and navbar DOWN→content
    // deterministic instead of relying on global geometry. Non-container
    // nodes (Settings, Search, etc.) return false and keep the old behavior.
    if (resolveContainerNav(cur, dir, pool, guideX)) return

    const isHorizontal = dir === 'left' || dir === 'right'
    const rowContainer = isHorizontal ? nearestHScrollContainer(cur.el) : null
    if (isHorizontal && rowContainer) {
      const rowPool = pool.filter((c) => c.el && rowContainer.contains(c.el) && c.id !== cur.id)
      const bestRow = findBest(cur, rowPool, dir, guideX)
      if (bestRow) {
        debugLog(`candidate=${bestRow.id} (row-local)`)
        applyFocus(bestRow.id)
        return
      }
      // At the edge of the row — stay on the current item.
      debugLog(`row edge — no candidate for ${dir}`)
      return
    }

    // ── Pass 1: same-region candidates ──
    if (curRegion) {
      const sameRegion = pool.filter((c) => c.region === curRegion && c.id !== cur.id)
      const bestSame = findBest(cur, sameRegion, dir, guideX)
      if (bestSame) {
        debugLog(`candidate=${bestSame.id} (same-region)`)
        applyFocus(bestSame.id)
        return
      }
    }

    // ── Pass 2: cross-region candidates (exclude regionless like navbar) ──
    const crossRegion = pool.filter((c) => c.id !== cur.id && c.region && c.region !== curRegion)
    const bestCross = findBest(cur, crossRegion, dir, guideX)

    // ── Pass 2b: fallback excluding regionless elements ──
    const bestAny = bestCross || findBest(cur, pool.filter((c) => c.id !== cur.id && c.region), dir, guideX)

    if (bestAny) {
      debugLog(`candidate=${bestAny.id} region=${bestAny.region || 'none'}`)
      // When entering a new region via vertical nav, try to restore that
      // region's last focused element if it's geometrically close.
      if (bestAny.region && bestAny.region !== curRegion && (dir === 'up' || dir === 'down')) {
        const mem = regionFocusMemory.get(bestAny.region)
        if (mem && mem.id !== bestAny.id) {
          const memEntry = pool.find((c) => c.id === mem.id && c.region === bestAny.region)
          if (memEntry) {
            // Only restore if the remembered element is reasonably close
            // to where the cross-region candidate was going to land.
            const memScore = scoreCandidate(cur, memEntry, dir, guideX)
            const candScore = scoreCandidate(cur, bestAny, dir, guideX)
            if (memScore < candScore * 1.6) {
              debugLog(`restoring region memory=${mem.id}`)
              applyFocus(memEntry.id)
              return
            }
          }
        }
      }
      applyFocus(bestAny.id)
      return
    }

    // No candidates anywhere — scroll the page so the user can reach beyond
    // the focusable edge, then stay put (the next press will reveal more).
    debugLog(`no candidates found for ${dir}`)
    if (dir === 'up' || dir === 'down') {
      const curEl = cur.el
      if (curEl && scrollOnNoMove(curEl, dir)) return
    }
  }, [eligible, applyFocus, findBest, resolveContainerNav, resolveDestination, containerMemberIds])

  const focusFirst = useCallback(() => {
    const pool = eligible()
    if (pool.length) applyFocus(pool[0].id)
  }, [eligible, applyFocus])

  const register = useCallback((id, entry) => {
    registryRef.current.set(id, entry)
    // Self-healing default: if nothing holds focus (fresh page, overlay just
    // opened, previous focus unmounted), take the next eligible registration.
    // Deferred so scope pushes that happen in parent effects settle first.
    if (!focusedIdRef.current) {
      requestAnimationFrame(() => {
        if (focusedIdRef.current != null) return
        const el = entry.elRef.current
        const top = scopeStackRef.current[scopeStackRef.current.length - 1]
        if (!el || !el.isConnected || entry.disabledRef.current || entry.scopeRef.current !== top) return
        applyFocus(id)
      })
    }
  }, [applyFocus])

  const unregister = useCallback((id) => {
    registryRef.current.delete(id)
    if (focusedIdRef.current === id) {
      focusedIdRef.current = null
      const top = scopeStackRef.current[scopeStackRef.current.length - 1]
      for (const [otherId, entry] of registryRef.current) {
        if (entry.scopeRef.current === top && !entry.disabledRef.current && entry.elRef.current?.isConnected) {
          applyFocus(otherId, false)
          break
        }
      }
    }
  }, [applyFocus])

  const activateFocused = useCallback(() => {
    const entry = focusedIdRef.current ? registryRef.current.get(focusedIdRef.current) : null
    if (!entry) return
    // Prefer the registered onSelect callback; fall back to a DOM click so
    // plain <a>/<button> elements still behave.
    if (typeof entry.onSelectRef?.current === 'function') {
      entry.onSelectRef.current()
      return
    }
    const el = entry.elRef.current
    if (el && typeof el.click === 'function') el.click()
  }, [])

  // ── Focus memory across routes ────────────────────────────────────────────
  const rememberFocus = useCallback((key) => {
    const page = document.querySelector('.tv-page')
    focusMemory.set(key, {
      id: focusedIdRef.current,
      scroll: page ? page.scrollTop : 0,
      at: Date.now(),
    })
    if (focusMemory.size > 24) {
      const oldest = [...focusMemory.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) focusMemory.delete(oldest[0])
    }
  }, [])

  const restoreFocus = useCallback((key, fallbackFirst = true) => {
    const saved = focusMemory.get(key)
    const raf = requestAnimationFrame(() => {
      let ok = false
      if (saved && saved.id) {
        const entry = registryRef.current.get(saved.id)
        const el = entry && entry.elRef.current
        const top = scopeStackRef.current[scopeStackRef.current.length - 1]
        if (el && el.isConnected && entry.scopeRef.current === top && !entry.disabledRef.current) {
          ok = applyFocus(saved.id, false)
        }
      }
      if (!ok && fallbackFirst) focusFirst()
      if (saved && saved.scroll > 0) {
        const page = document.querySelector('.tv-page')
        if (page) page.scrollTop = saved.scroll
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [applyFocus, focusFirst])

  const pushScope = useCallback((scope) => {
    scopeStackRef.current.push(scope)
    // Entering an overlay drops page focus so root elements can't stay lit.
    if (focusedIdRef.current) setFocusedClass(focusedIdRef.current, false)
    focusedIdRef.current = null
  }, [setFocusedClass])

  const popScope = useCallback(() => {
    if (scopeStackRef.current.length > 1) scopeStackRef.current.pop()
    // Restore focus to something on the revealed layer.
    const top = scopeStackRef.current[scopeStackRef.current.length - 1]
    for (const [id, entry] of registryRef.current) {
      if (entry.scopeRef.current === top && !entry.disabledRef.current && entry.elRef.current?.isConnected) {
        applyFocus(id, false)
        break
      }
    }
  }, [applyFocus])

  // Debug state for overlay
  const debugStateRef = useRef({ current: null, up: null, down: null, left: null, right: null })
  const notifyDebug = useCallback(() => {
    debugListenersRef.current.forEach((fn) => {
      try { fn() } catch { /* ignore */ }
    })
  }, [])

  const updateDebugState = useCallback(() => {
    if (!debugEnabled) return
    const pool = eligible()
    const cur = pool.find((c) => c.id === focusedIdRef.current)
    if (!cur) { debugStateRef.current = { current: null, up: null, down: null, left: null, right: null }; notifyDebug(); return }

    const findBestForDebug = (direction) => {
      const guideX = cur.r.left + cur.r.width / 2
      const b = findBest(cur, pool, direction, null)
      return b ? { id: b.id, region: b.region || 'none' } : null
    }

    debugStateRef.current = {
      current: { id: cur.id, region: cur.region || 'none' },
      up: findBestForDebug('up'),
      down: findBestForDebug('down'),
      left: findBestForDebug('left'),
      right: findBestForDebug('right'),
    }
    notifyDebug()
  }, [eligible, findBest, notifyDebug])

  // Mouse support (desktop testing): clicking anywhere syncs the focus ring.
  useEffect(() => {
    const onClick = (e) => {
      const target = e.target.closest && e.target.closest('[data-tv-id]')
      if (!target) return
      const id = target.getAttribute('data-tv-id')
      if (registryRef.current.has(id)) {
        const entry = registryRef.current.get(id)
        const top = scopeStackRef.current[scopeStackRef.current.length - 1]
        if (entry.scopeRef.current === top) applyFocus(id, false)
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [applyFocus])

  // Single global keydown handler.
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target && e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return
      if (e.altKey || e.ctrlKey || e.metaKey) return

      const dir = NAV_KEYS[e.key]
      if (dir) {
        // A focused element can consume directional keys (e.g. the player's
        // seekbar seeking with Left/Right instead of moving focus).
        const curEntry = focusedIdRef.current ? registryRef.current.get(focusedIdRef.current) : null
        if (curEntry && typeof curEntry.onDirRef?.current === 'function' && curEntry.onDirRef.current(dir) === true) {
          e.preventDefault()
          return
        }
        e.preventDefault()
        moveFocus(dir)
        updateDebugState()
        return
      }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Select') {
        if (!focusedIdRef.current) {
          const pool = eligible()
          if (pool.length) applyFocus(pool[0].id)
          return
        }
        e.preventDefault()
        activateFocused()
        return
      }
      if (e.key === 'Escape' || e.key === 'GoBack') {
        e.preventDefault()
        const curEntry = focusedIdRef.current ? registryRef.current.get(focusedIdRef.current) : null
        if (curEntry && typeof curEntry.onBackRef?.current === 'function' && curEntry.onBackRef.current() === true) {
          return
        }
        window.history.back()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moveFocus, eligible, applyFocus, activateFocused, updateDebugState])

  const subscribeDebug = useCallback((fn) => {
    debugListenersRef.current.add(fn)
    return () => debugListenersRef.current.delete(fn)
  }, [])

  // Stage 0 (additive): serialize the focusable tree for debugging. Returns a
  // plain structure of every container, its child focusables, and its per-
  // container focus memory. Does not change navigation.
  const dumpTree = useCallback(() => {
    const root = {}
    containersRef.current.forEach((c, id) => {
      const children = []
      containerMemberIds(id).forEach((nodeId) => {
        const e = registryRef.current.get(nodeId)
        if (!e) return
        children.push({
          id: nodeId,
          region: e.regionRef?.current || null,
          key: e.elRef?.current?.getAttribute?.('data-tv-key') || null,
        })
      })
      root[id] = {
        id,
        region: c.region,
        preferredChildKey: c.preferredChildKey,
        exits: c.exits,
        lastFocusedChild: c.lastFocusedChild,
        children,
      }
    })
    return root
  }, [containerMemberIds])

  const value = useMemo(
    () => ({
      register, unregister, moveFocus, focusFirst, applyFocus,
      pushScope, popScope, rememberFocus, restoreFocus, subscribe,
      subscribeDebug, debugStateRef,
      registerContainer, unregisterContainer, updateContainer,
      addNodeToContainer,
      removeNodeFromContainer, containersRef, dumpTree,
    }),
    [register, unregister, moveFocus, focusFirst, applyFocus,
     pushScope, popScope, rememberFocus, restoreFocus, subscribe,
     subscribeDebug,
     registerContainer, unregisterContainer, updateContainer,
     addNodeToContainer,
     removeNodeFromContainer, dumpTree]
  )

  return <TVFocusContext.Provider value={value}>{children}</TVFocusContext.Provider>
}

export function useTVFocus() {
  return useContext(TVFocusContext)
}

/**
 * Stage 0 (additive): access the current focusable-tree metadata (containers,
 * their children and per-container memory). Useful for a development overlay.
 * Returns a fresh object each render; does not change navigation.
 */
export function useTVFocusTree() {
  const ctx = useTVFocus()
  const [, force] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    if (!ctx) return undefined
    let id
    const tick = () => { id = requestAnimationFrame(tick); force() }
    tick()
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx])
  return ctx ? ctx.dumpTree() : {}
}

/**
 * Attach to any focusable element:
 *   const f = useFocusable({ onSelect: () => ... })
 *   <button ref={f.ref} onClick={...}>OK</button>
 *
 * `onSelect` runs when the focused element is activated with Enter/OK on the
 * remote. It takes precedence over a synthetic el.click(); pass both when the
 * element should also be mouse-clickable.
 *
 * Optional params:
 *   region    — logical navigation area (e.g. 'trending', 'hero', 'results')
 *   entry     — marks this as the region's preferred landing target
 *   focusKey  — stable logical id (e.g. 'trending-0', 'navbar-home'). Overrides
 *               the auto-generated id so it can be targeted by container exits
 *               and focus memory across DOM remounts. (Stage 0)
 *   container — id of the parent focusable container this node belongs to.
 *               Records focus-tree parentage for container memory. (Stage 0)
 */
export function useFocusable({ disabled = false, scope = 'root', autoFocus = false, onSelect, onArrow, onBack, region: regionProp, entry = false, focusKey = null, container = null, exit = null } = {}) {
  const ctx = useTVFocus()
  const regionFromContext = useContext(TVRegionContext)
  const region = regionProp || regionFromContext || null

  const idRef = useRef(null)
  if (!idRef.current) idRef.current = focusKey || nextId()
  // Keep the registry id in sync if the caller changes the stable key.
  const prevFocusKeyRef = useRef(focusKey)
  if (focusKey && prevFocusKeyRef.current !== focusKey) {
    idRef.current = focusKey
    prevFocusKeyRef.current = focusKey
  }
  const elRef = useRef(null)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onDirRef = useRef(onArrow)
  onDirRef.current = onArrow
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const regionRef = useRef(region)
  regionRef.current = region
  const entryRef = useRef(entry)
  entryRef.current = entry
  const containerRef = useRef(container)
  containerRef.current = container
  const exitRef = useRef(exit)
  exitRef.current = exit

  useEffect(() => {
    if (!ctx) return undefined
    const id = idRef.current
    const el = elRef.current
    if (!el) return undefined
    el.setAttribute('data-tv-id', id)
    el.setAttribute('data-tv-focusable', 'true')
    if (region) el.setAttribute('data-tv-region', region)
    if (focusKey) el.setAttribute('data-tv-key', focusKey)
    if (container) el.setAttribute('data-tv-container', container)
    try { el.tabIndex = -1 } catch { /* non-HTMLElement */ }
    ctx.register(id, { elRef, scopeRef: { current: scope }, disabledRef, onSelectRef, onDirRef, onBackRef, regionRef, entryRef, containerRef, exitRef })
    if (container) ctx.addNodeToContainer(container, id)
    if (autoFocus) requestAnimationFrame(() => ctx.applyFocus(id, false))
    return () => {
      if (container) ctx.removeNodeFromContainer(container, id)
      el.removeAttribute('data-tv-id')
      el.removeAttribute('data-tv-focusable')
      el.removeAttribute('data-tv-region')
      el.removeAttribute('data-tv-key')
      el.removeAttribute('data-tv-container')
      ctx.unregister(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, scope, region, container, focusKey])

  return { ref: elRef }
}

/**
 * Stage 0 (additive): declare a focusable container in the focus tree.
 *
 * A container groups child focusables under one parent id so navigation can be
 * scoped and memory can be kept per container.
 *
 *   const cont = useFocusContainer({
 *     id: 'navbar',
 *     region: 'navbar',
 *     preferredChildKey: 'navbar-home',
 *     exits: { down: 'hero-entry' },
 *     exitFirst: ['down'],
 *   })
 *   <aside ref={cont.ref}> ... children useFocusable({ container: 'navbar' }) ... </aside>
 *
 * `exits` maps a direction to a destination focusKey or container id. When a
 * direction is in `exitFirst`, that exit takes priority over moving to a
 * sibling child (used e.g. so navbar DOWN goes straight to content). Sibling
 * navigation runs inside the container first (or the exit first when flagged),
 * then the exit, then stay at the boundary.
 */
export function useFocusContainer({ id, region = null, preferredChildKey = null, exits = {}, exitFirst = [] }) {
  const ctx = useTVFocus()
  const elRef = useRef(null)
  const idRef = useRef(id)
  idRef.current = id

  // Register once on mount so children membership is never disturbed by
  // re-renders (a re-register would reset the children set).
  useEffect(() => {
    if (!ctx || !idRef.current) return undefined
    ctx.registerContainer(idRef.current, {
      region,
      elRef,
      preferredChildKey,
      exits,
      exitFirst,
    })
    return () => ctx.unregisterContainer(idRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx])

  // Push config updates without re-registering (children/memory persist).
  useEffect(() => {
    if (!ctx || !idRef.current) return
    ctx.updateContainer(idRef.current, {
      region,
      elRef,
      preferredChildKey,
      exits,
      exitFirst,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, id, region, preferredChildKey, exits, JSON.stringify(exitFirst)])

  return { ref: elRef }
}

/**
 * Remember where focus (and page scroll) is while a page is mounted, and put
 * it back identically on mount. Use the same key for a given page:
 *
 *   useTVFocusMemory('home')   // in TVHome
 *
 * The snapshot updates live on every focus/scroll change, so returning from
 * Details/Player restores the exact card that launched them — no unmount-order
 * races. Pages that have no snapshot fall back to their first focusable.
 */
export function useTVFocusMemory(pageKey) {
  const ctx = useTVFocus()
  const keyRef = useRef(pageKey)
  keyRef.current = pageKey

  useEffect(() => {
    if (!ctx) return undefined
    const unsubscribe = ctx.subscribe(() => ctx.rememberFocus(keyRef.current))
    const onPageScroll = () => ctx.rememberFocus(keyRef.current)
    window.addEventListener('scroll', onPageScroll, true)
    const cancelRestore = ctx.restoreFocus(keyRef.current, true)
    return () => {
      cancelRestore()
      unsubscribe()
      window.removeEventListener('scroll', onPageScroll, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx])
}

/**
 * Trap D-pad focus inside an overlay while it is mounted:
 *   const scope = useTVScope(open)          // conditional
 *   <TVButton tvScope={scope}>Close</TVButton>
 */
export function useTVScope(active = true) {
  const ctx = useTVFocus()
  const scopeRef = useRef(null)
  if (!scopeRef.current) scopeRef.current = `scope-${nextId()}`
  useEffect(() => {
    if (!ctx || !active) return undefined
    ctx.pushScope(scopeRef.current)
    return () => ctx.popScope()
  }, [ctx, active])
  return scopeRef.current
}

/**
 * BACK handling that unifies Escape, remote BACK and browser back. While
 * `active`, a sentinel history entry is pushed; popping it (physical BACK or
 * our Escape handler calling history.back()) invokes `onBack` instead of
 * navigating away. Closing via UI quietly consumes the sentinel.
 *
 *   useTVBackHandler(showEpisodes, () => setShowEpisodes(false))
 */
export function useTVBackHandler(active, onBack) {
  const cbRef = useRef(onBack)
  cbRef.current = onBack
  const tokenRef = useRef(null)
  if (!tokenRef.current) tokenRef.current = { tvSentinel: `bh-${nextId()}` }
  useEffect(() => {
    if (!active) return undefined
    const token = tokenRef.current
    window.history.pushState(token, '')
    let detached = false
    const onPop = () => {
      if (detached) return
      cbRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      detached = true
      window.removeEventListener('popstate', onPop)
      if (window.history.state === token) window.history.back()
    }
  }, [active])
}

// ── Debug overlay ──────────────────────────────────────────────────────────

/**
 * Development-only D-pad debug overlay. Shows current focus, direction
 * candidates, and region info. Enable via window.__tv_debug = true.
 */
export function TVDebugOverlay() {
  const ctx = useTVFocus()
  const [, forceUpdate] = useReducer((x) => x + 1, 0)

  useEffect(() => {
    if (!ctx || !debugEnabled) return undefined
    return ctx.subscribeDebug(forceUpdate)
  }, [ctx, forceUpdate])

  if (!debugEnabled || !ctx) return null

  const st = ctx.debugStateRef?.current
  if (!st?.current) return null

  const row = (label, data) => (
    <div key={label} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span style={{ color: '#a78bfa', minWidth: 52 }}>{label}:</span>
      <span style={{ color: '#e2e8f0' }}>{data?.id || '—'}</span>
      <span style={{ color: '#64748b' }}>({data?.region || 'none'})</span>
    </div>
  )

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        background: 'rgba(0,0,0,0.88)',
        border: '1px solid rgba(139,92,246,0.45)',
        borderRadius: 10,
        padding: '10px 14px',
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.6,
        zIndex: 99999,
        pointerEvents: 'none',
        minWidth: 240,
      }}
    >
      <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>[TV-DPAD]</div>
      {row('Current', st.current)}
      {row('UP', st.up)}
      {row('DOWN', st.down)}
      {row('LEFT', st.left)}
      {row('RIGHT', st.right)}
    </div>
  )
}
