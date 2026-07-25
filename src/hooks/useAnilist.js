import { useState, useEffect, useCallback, useRef } from 'react'

export function useAnilistFetch(fetchFn) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    setError(null)

    fetchFn()
      .then((result) => { if (mountedRef.current) setData(result) })
      .catch((err) => { if (mountedRef.current) setError(err.message) })
      .finally(() => { if (mountedRef.current) setLoading(false) })

    return () => { mountedRef.current = false }
  }, [])

  return { data, loading, error }
}

export function useAnilistSearch(fetchFn) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const search = useCallback(async (searchQuery) => {
    setQuery(searchQuery)
    if (!searchQuery.trim()) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFn(searchQuery)
      if (mountedRef.current) setData(result)
    } catch (err) {
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [fetchFn])

  return { query, data, loading, error, search }
}
