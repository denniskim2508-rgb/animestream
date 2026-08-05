// In-memory cache with TTL expiry and single-flight dedup: concurrent requests
// for the same key share one in-flight promise instead of hammering the upstream
// provider, and successful results are stored for the TTL. Failed lookups are
// never cached, so a blip does not poison the cache.

function createMemoryCache(options = {}) {
  const { ttlMs = 5 * 60 * 1000, maxEntries = 500 } = options
  const store = new Map()

  function prune() {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.exp && now > entry.exp) store.delete(key)
    }
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }

  function get(key) {
    const entry = store.get(key)
    if (!entry) return undefined
    if (entry.exp && Date.now() > entry.exp) {
      store.delete(key)
      return undefined
    }
    return entry.value
  }

  function set(key, value, ttl = ttlMs) {
    prune()
    store.set(key, { value, exp: Date.now() + ttl })
    return value
  }

  function del(key) {
    store.delete(key)
  }

  function clear() {
    store.clear()
  }

  function size() {
    return store.size
  }

  function keys() {
    return [...store.keys()]
  }

  // Run `fn` once; concurrent callers for the same key await the same promise.
  function singleFlight(key, fn) {
    const existing = store.get(key)
    if (existing?.inFlight) return existing.inFlight
    const promise = Promise.resolve().then(fn)
    store.set(key, { inFlight: promise, exp: 0 })
    promise.then(
      () => {
        if (store.get(key)?.inFlight === promise) store.delete(key)
      },
      () => {
        if (store.get(key)?.inFlight === promise) store.delete(key)
      },
    )
    return promise
  }

  // Single-flight with caching: store the resolved value for `ttl` so later
  // calls hit the cache, and drop the entry on rejection.
  async function cached(key, fn, ttl = ttlMs) {
    const hit = get(key)
    if (hit !== undefined) return hit
    const existing = store.get(key)
    if (existing?.inFlight) return existing.inFlight

    const promise = Promise.resolve().then(fn)
    store.set(key, { inFlight: promise, exp: 0 })
    try {
      const value = await promise
      if (store.get(key)?.inFlight === promise) {
        prune()
        store.set(key, { value, exp: Date.now() + ttl })
      }
      return value
    } catch (err) {
      if (store.get(key)?.inFlight === promise) store.delete(key)
      throw err
    }
  }

  return { get, set, del, clear, size, keys, singleFlight, cached }
}

export { createMemoryCache }

// Named registries so services can share caches by name without globals.
const named = new Map()

export function cache(name, options) {
  if (!named.has(name)) named.set(name, createMemoryCache(options))
  return named.get(name)
}

export function clearAll() {
  for (const c of named.values()) c.clear()
}
