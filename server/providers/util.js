// Shared helpers for manga providers (used by the Provider Manager).
// These are intentionally provider-agnostic so new adapters can reuse them.

export function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Strict title scoring: exact match (100) or a one-way word-subset with at
// most one extra word (96). Anything else is rejected to avoid linking the
// wrong series (doujinshi, spin-offs, sequels like "Vol. Rising").
export function titleScore(query, title) {
  const a = normalizeTitle(query)
  const b = normalizeTitle(title)
  if (!a || !b) return 0
  if (a === b) return 100
  const aw = a.split(' ').filter(Boolean)
  const bw = b.split(' ').filter(Boolean)
  const isSubset = (outer, inner) => inner.every((w) => outer.includes(w))
  if (isSubset(aw, bw) || isSubset(bw, aw)) {
    const extra = isSubset(aw, bw)
      ? aw.filter((w) => !bw.includes(w))
      : bw.filter((w) => !aw.includes(w))
    if (extra.length <= 1) return 96
  }
  return 0
}

export function isDoujinshiOrColored(...strings) {
  const s = strings.filter(Boolean).join(' ')
  return /\b(doujinshi|colored)\b/i.test(s)
}

// ── Header codecs for the media proxy ──────────────────────────

export function encodeHeaders(headers) {
  return Buffer.from(JSON.stringify(headers)).toString('base64url')
}

export function decodeHeaders(h) {
  try { return JSON.parse(Buffer.from(h, 'base64url').toString()) }
  catch { return {} }
}
