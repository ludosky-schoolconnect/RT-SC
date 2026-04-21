/**
 * RT-SC · Entry point.
 *
 * Mounts the app inside <div id="root">.
 * Wires up:
 *   - Global styles (tokens + base + Tailwind)
 *   - React Query with mobile-friendly defaults
 *   - React Router (BrowserRouter)
 *   - Firestore assertion auto-recovery (global handlers)
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import './styles/tokens.css'
import './styles/base.css'

// ───────────────────────────────────────────────────────────────
// Firestore SDK auto-recovery
// ───────────────────────────────────────────────────────────────
//
// Firebase Firestore 10.x has a well-known bug where it throws
// "FIRESTORE (VERSION) INTERNAL ASSERTION FAILED: Unexpected state"
// out of nowhere. It usually fires from ASYNC code (onSnapshot
// callbacks, mutation chains) and therefore escapes React error
// boundaries. When it does, the SDK's internal state machine is
// corrupted and the only reliable recovery is a page reload, which
// re-initializes the Firestore client from scratch.
//
// We listen on `window` for both synchronous errors and unhandled
// promise rejections, detect the assertion signature, and trigger
// a soft reload. Non-Firestore errors pass through untouched —
// we don't want to mask real bugs.
//
// A short-lived guard prevents a reload loop in the pathological
// case where the error fires IMMEDIATELY after reload (the
// sessionStorage key expires after 10 seconds so subsequent
// genuine failures can still self-heal).

const RELOAD_GUARD_KEY = 'sc_firestore_assertion_reload_at'
const RELOAD_LOOP_WINDOW_MS = 10_000

function isFirestoreAssertion(msg: string): boolean {
  return (
    msg.includes('FIRESTORE') &&
    msg.includes('INTERNAL ASSERTION FAILED')
  )
}

function scheduleSoftReload(): void {
  try {
    const lastReload = Number(
      sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0'
    )
    if (Date.now() - lastReload < RELOAD_LOOP_WINDOW_MS) {
      // Already reloaded recently — don't loop. User will see the
      // generic error and can reload manually.
      console.error(
        '[firestore-guard] Suppressing auto-reload (fired within 10s of last reload). Manual reload required.'
      )
      return
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage unavailable — proceed anyway
  }

  // 800ms gives the console.error above time to flush
  setTimeout(() => window.location.reload(), 800)
}

window.addEventListener('error', (event) => {
  const msg = event.error?.message ?? event.message ?? ''
  if (isFirestoreAssertion(msg)) {
    console.warn(
      '[firestore-guard] Caught global Firestore assertion — auto-reloading.'
    )
    scheduleSoftReload()
    // Don't preventDefault — we still want the error logged
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const msg = (reason?.message ?? String(reason)) || ''
  if (isFirestoreAssertion(msg)) {
    console.warn(
      '[firestore-guard] Caught unhandled Firestore rejection — auto-reloading.'
    )
    scheduleSoftReload()
  }
})

// ───────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch if data is younger than 1 minute
      staleTime: 60_000,
      // Keep unused query data in memory for 10 minutes
      gcTime: 10 * 60_000,
      // Mobile browsers fire focus/blur very aggressively — disable refetch on focus
      refetchOnWindowFocus: false,
      // Respect staleTime on remount (don't refetch if cache is fresh)
      refetchOnMount: false,
      // Limited retries — Firestore failures are usually permanent (rules / offline)
      retry: 2,
    },
    mutations: {
      retry: 0,
    },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root element not found in index.html')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
