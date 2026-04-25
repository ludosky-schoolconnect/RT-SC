/**
 * RT-SC · Server-authoritative time.
 *
 * Fetches the real current time from a public API on every page load.
 * Time then progresses via performance.now() — a monotonic hardware
 * counter that is completely independent of the device clock. The
 * device clock (Date.now / new Date) is never used after the first
 * API response arrives; it is only touched as an unavoidable fallback
 * during the brief boot window (~200–500 ms) before that response.
 *
 * How it works:
 *   _baseServerMs  = absolute UTC ms returned by the time API
 *   _baseMonoMs    = performance.now() captured at the moment of that fetch
 *   serverNow()    = new Date(_baseServerMs + (performance.now() - _baseMonoMs))
 *
 * Because performance.now() only measures elapsed milliseconds since
 * page-navigation start, changing the device clock has zero effect on
 * any value produced by serverNow() after the first sync completes.
 *
 * Primary:    WorldTimeAPI  (free, no auth, returns unixtime in seconds)
 * Fallback:   TimeAPI.io    (free, no auth, returns ISO datetime string)
 *
 * Latency compensation: we add half the measured round-trip to the server
 * timestamp so the stored value reflects the midpoint of the request, not
 * the moment the server sent its response.
 *
 * Re-sync: once per hour and whenever the tab returns to the foreground
 * (device wake / browser tab switch), so long-idle sessions stay accurate.
 */

const RESYNC_MS = 60 * 60 * 1000  // 1 hour

// The two pillars of the time computation. Both are null until the
// first sync completes (the boot-window fallback handles that gap).
let _baseServerMs: number | null = null
let _baseMonoMs: number | null = null
let _promise: Promise<void> | null = null

// ─── API fetchers ─────────────────────────────────────────────

async function fromWorldTimeAPI(): Promise<{ serverMs: number; monoMs: number }> {
  const t0 = performance.now()
  const res = await fetch(
    'https://worldtimeapi.org/api/timezone/Africa/Porto-Novo',
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`WorldTimeAPI HTTP ${res.status}`)
  const data = await res.json() as { unixtime: number }
  const t1 = performance.now()
  return {
    serverMs: data.unixtime * 1000 + (t1 - t0) / 2,
    monoMs: t1,
  }
}

async function fromTimeAPIio(): Promise<{ serverMs: number; monoMs: number }> {
  const t0 = performance.now()
  const res = await fetch(
    'https://timeapi.io/api/time/current/zone?timeZone=Africa%2FPorto-Novo',
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`TimeAPI.io HTTP ${res.status}`)
  const data = await res.json() as { dateTime: string }
  const t1 = performance.now()
  // dateTime is WAT (UTC+1) without offset suffix — append it for correct parse
  const serverMs = new Date(data.dateTime + '+01:00').getTime()
  return {
    serverMs: serverMs + (t1 - t0) / 2,
    monoMs: t1,
  }
}

// ─── Core sync ────────────────────────────────────────────────

async function doSync(): Promise<void> {
  for (const fetcher of [fromWorldTimeAPI, fromTimeAPIio]) {
    try {
      const { serverMs, monoMs } = await fetcher()
      _baseServerMs = serverMs
      _baseMonoMs = monoMs
      return
    } catch (err) {
      console.warn('[serverTime] fetcher failed, trying next:', (err as Error).message)
    }
  }
  console.warn('[serverTime] All time APIs unreachable — device clock used as fallback.')
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Kick off a server time sync. Safe to call multiple times — concurrent
 * calls share the same in-flight promise.
 */
export function syncServerTime(): Promise<void> {
  if (!_promise) {
    _promise = doSync().finally(() => { _promise = null })
  }
  return _promise
}

/**
 * Returns the current server-authoritative time.
 *
 * After the first sync: purely monotonic — device clock has no influence.
 * Before the first sync: device clock used as a last resort for the brief
 * boot window before the API response arrives (~200–500 ms).
 */
export function serverNow(): Date {
  if (_baseServerMs !== null && _baseMonoMs !== null) {
    return new Date(_baseServerMs + (performance.now() - _baseMonoMs))
  }
  // Boot-window fallback — replaced as soon as the first sync completes.
  return new Date()
}

/**
 * Start hourly background re-sync + re-sync on tab focus restore.
 * Call once on app init alongside syncServerTime().
 */
export function startPeriodicTimeSync(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncServerTime()
  })
  setInterval(syncServerTime, RESYNC_MS)
}
