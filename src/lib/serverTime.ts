/**
 * RT-SC · Server-authoritative time.
 *
 * Fetches the real current time from a public API on app init, computes
 * the offset between server and client clocks, then exposes serverNow()
 * used everywhere in place of new Date(). This makes the app's entire
 * perception of time independent of the user's device clock.
 *
 * Primary:    WorldTimeAPI  (free, no auth, returns unixtime in seconds)
 * Fallback:   TimeAPI.io    (free, no auth, returns ISO datetime string)
 * Last resort: client time  (offset stays 0, warning logged)
 *
 * The computed offset is cached in sessionStorage so subsequent page loads
 * within the same session skip the API call entirely. The cache expires
 * after 1 hour, after which the next call re-syncs. Additionally, the
 * sync re-runs whenever the tab comes back to foreground (device wake,
 * browser tab switch) to avoid stale offsets after long idle periods.
 *
 * Latency compensation: the server timestamp returned by the API
 * corresponds to the moment the server processed the request, roughly
 * midway through the round-trip. We add half the round-trip duration
 * to the server time before computing the offset.
 */

const CACHE_KEY    = 'rt_sc_srv_offset'
const CACHE_EXP_KEY = 'rt_sc_srv_offset_exp'
const RESYNC_MS    = 60 * 60 * 1000  // 1 hour

let _offset = 0                       // server − client, in ms
let _promise: Promise<void> | null = null

// ─── API fetchers ─────────────────────────────────────────────

async function fromWorldTimeAPI(): Promise<number> {
  const t0 = Date.now()
  const res = await fetch(
    'https://worldtimeapi.org/api/timezone/Africa/Porto-Novo',
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`WorldTimeAPI HTTP ${res.status}`)
  const data = await res.json() as { unixtime: number }
  const t1 = Date.now()
  // unixtime is UTC seconds; add half round-trip to compensate latency
  return data.unixtime * 1000 + (t1 - t0) / 2 - t1
}

async function fromTimeAPIio(): Promise<number> {
  const t0 = Date.now()
  const res = await fetch(
    'https://timeapi.io/api/time/current/zone?timeZone=Africa%2FPorto-Novo',
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`TimeAPI.io HTTP ${res.status}`)
  const data = await res.json() as { dateTime: string }
  const t1 = Date.now()
  // dateTime is WAT (UTC+1) without offset suffix — append it for correct parse
  const serverMs = new Date(data.dateTime + '+01:00').getTime()
  return serverMs + (t1 - t0) / 2 - t1
}

// ─── Core sync ────────────────────────────────────────────────

async function doSync(): Promise<void> {
  // Restore cached offset if still fresh
  try {
    const exp = parseInt(sessionStorage.getItem(CACHE_EXP_KEY) ?? '0', 10)
    if (exp > Date.now()) {
      const cached = parseFloat(sessionStorage.getItem(CACHE_KEY) ?? 'NaN')
      if (!isNaN(cached)) {
        _offset = cached
        return
      }
    }
  } catch { /* sessionStorage unavailable */ }

  // Try APIs in order — first success wins
  for (const fetcher of [fromWorldTimeAPI, fromTimeAPIio]) {
    try {
      _offset = await fetcher()
      try {
        sessionStorage.setItem(CACHE_KEY, String(_offset))
        sessionStorage.setItem(CACHE_EXP_KEY, String(Date.now() + RESYNC_MS))
      } catch { /* storage write failed — non-fatal */ }
      return
    } catch (err) {
      console.warn('[serverTime] fetcher failed, trying next:', (err as Error).message)
    }
  }

  console.warn('[serverTime] All time APIs unreachable — using device clock as fallback.')
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
 * Before the first sync completes, returns device time (offset = 0).
 */
export function serverNow(): Date {
  return new Date(Date.now() + _offset)
}

/**
 * Start hourly background re-sync + re-sync on tab focus restore.
 * Call once on app init alongside syncServerTime().
 */
export function startPeriodicTimeSync(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try { sessionStorage.removeItem(CACHE_EXP_KEY) } catch { /* ignore */ }
      syncServerTime()
    }
  })
  setInterval(() => {
    try { sessionStorage.removeItem(CACHE_EXP_KEY) } catch { /* ignore */ }
    syncServerTime()
  }, RESYNC_MS)
}
