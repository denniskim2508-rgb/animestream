// Credential-less Firebase ID token verification for server routes.
// Verifies the RS256 signature against Google's public X509 certs for the
// Firebase Auth securetoken issuer, so the server can trust `request.auth`
// without shipping a service-account key or the Admin SDK.

import { createLocalJWKSet, jwtVerify, importX509, exportJWK } from 'jose'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'kaisen-x-anime'
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

let jwksPromise = null

async function buildJwks() {
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error(`failed to fetch Firebase certs: ${res.status}`)
  const certs = await res.json()
  const keys = await Promise.all(
    Object.entries(certs).map(async ([kid, pem]) => {
      const key = await importX509(pem, 'RS256')
      return { ...(await exportJWK(key)), kid }
    }),
  )
  return createLocalJWKSet({ keys })
}

function getJwks() {
  if (!jwksPromise) {
    jwksPromise = buildJwks().catch((err) => {
      jwksPromise = null // allow a retry on the next request
      throw err
    })
  }
  return jwksPromise
}

// Returns the user's UID, or null when the token is missing/invalid/expired.
export async function verifyFirebaseToken(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const { payload } = await jwtVerify(token, await getJwks(), {
      issuer: ISSUER,
      audience: PROJECT_ID,
    })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export function bearerToken(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null
}

// Per-user daily budget for AI resolver invocations (best-effort, in-memory;
// resets on restart, which is acceptable for a cost guard).
const AI_DAILY_LIMIT = Number(process.env.AI_RESOLVER_DAILY_LIMIT) || 40
const aiUsage = new Map() // uid -> { day, count }

export function aiResolverQuotaExceeded(uid) {
  const day = new Date().toISOString().slice(0, 10)
  const rec = aiUsage.get(uid)
  if (!rec || rec.day !== day) {
    aiUsage.set(uid, { day, count: 1 })
    return false
  }
  if (rec.count >= AI_DAILY_LIMIT) return true
  rec.count += 1
  return false
}

export { PROJECT_ID }
