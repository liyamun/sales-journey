/** Loading and running actions, with errors kept for the screen to show. */

import { useCallback, useEffect, useState } from 'react'

/* ---------- Data loading ---------- */

/** Loads once, and again whenever `reload()` is called. A failure is shown, never swallowed. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    load().then(
      (d) => alive && (setData(d), setError(undefined), setLoading(false)),
      (e: unknown) => alive && (setError(e instanceof Error ? e.message : String(e)), setLoading(false)),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

/** Runs one action at a time, with its error kept for the screen to show. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, run, clearError: () => setError(undefined) }
}

