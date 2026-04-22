/**
 * RT-SC · Service worker reset (kill switch).
 *
 * Public, unauthenticated route reachable at `/reset-sw`.
 *
 * What it does, in order:
 *   1. Unregister every service worker installed under this origin.
 *   2. Delete every CacheStorage entry (precache + runtime caches).
 *   3. Attempt to clear the PWA caches Workbox owns by name (belt and
 *      suspenders — the previous step already deletes all named caches,
 *      this just guarantees coverage if a future version adds more).
 *   4. Show a status message so the user (or support) can confirm the
 *      reset worked, then offer a "Revenir à l'accueil" button that
 *      hard-reloads `/`.
 *
 * Why this exists: service workers are sticky. If a bad SW somehow
 * ships and caches a broken app, users are locked into that broken
 * version. Rather than walk a non-technical admin through clearing
 * browser data on their phone, we send them one link.
 *
 * This route is precache-excluded via `navigateFallbackDenylist` in
 * vite.config.ts, so it always reaches the live React app even if
 * the SW is misbehaving.
 *
 * The Firestore SDK's IndexedDB cache is NOT cleared here. That's
 * user data (queued writes, offline reads) and clearing it would be
 * destructive. The SW cache (served bytes) is what this page resets.
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

type Status = 'running' | 'done' | 'error'

export default function ResetSwPage() {
  const [status, setStatus] = useState<Status>('running')
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function reset() {
      const lines: string[] = []
      try {
        // 1. Unregister service workers
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          for (const r of regs) {
            await r.unregister()
          }
          lines.push(`Service workers désinscrits : ${regs.length}`)
        } else {
          lines.push('Service workers non supportés sur ce navigateur.')
        }

        // 2. Clear all CacheStorage entries
        if ('caches' in window) {
          const keys = await caches.keys()
          for (const k of keys) {
            await caches.delete(k)
          }
          lines.push(`Caches supprimés : ${keys.length}`)
        }

        if (!cancelled) {
          setLog(lines)
          setStatus('done')
        }
      } catch (err) {
        if (!cancelled) {
          setLog([...lines, `Erreur : ${(err as Error).message}`])
          setStatus('error')
        }
      }
    }

    void reset()

    return () => {
      cancelled = true
    }
  }, [])

  function goHome() {
    // Hard reload so the browser re-fetches index.html from the
    // network (no more SW to intercept) and starts fresh.
    window.location.replace('/')
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h1 className="font-display text-xl font-bold text-navy mb-4">
          Réinitialisation de l'application
        </h1>

        {status === 'running' && (
          <div className="flex items-start gap-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3">
            <Loader2
              className="h-5 w-5 shrink-0 animate-spin text-navy"
              aria-hidden
            />
            <p className="text-[0.9rem] text-ink-700 leading-snug">
              Nettoyage du cache en cours…
            </p>
          </div>
        )}

        {status === 'done' && (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-bg/50 p-3 mb-4">
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-success-dark"
                aria-hidden
              />
              <p className="text-[0.9rem] text-success-dark leading-snug">
                Nettoyage terminé. Votre prochaine ouverture chargera la
                version la plus récente.
              </p>
            </div>
            <button
              type="button"
              onClick={goHome}
              className="w-full rounded-lg bg-navy px-4 py-3 text-[0.95rem] font-bold text-white transition-colors hover:bg-navy-dark"
            >
              Revenir à l'accueil
            </button>
          </>
        )}

        {status === 'error' && (
          <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-bg/50 p-3">
            <AlertCircle
              className="h-5 w-5 shrink-0 text-danger-dark"
              aria-hidden
            />
            <p className="text-[0.9rem] text-danger-dark leading-snug">
              Impossible de nettoyer automatiquement. Essayez de vider le
              cache du navigateur depuis ses paramètres.
            </p>
          </div>
        )}

        {log.length > 0 && (
          <details className="mt-4 text-[0.75rem] text-ink-500">
            <summary className="cursor-pointer">Détails techniques</summary>
            <ul className="mt-2 space-y-1 font-mono">
              {log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
