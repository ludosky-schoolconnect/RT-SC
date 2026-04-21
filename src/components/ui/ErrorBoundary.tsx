/**
 * RT-SC · Local error boundary.
 *
 * Wraps a child subtree to catch render errors and show a fallback
 * instead of crashing the whole app. Use sparingly — for risky modals,
 * rich content (BulletinView), or anywhere a crash would white-screen
 * the user.
 *
 * The actual error is logged to console.error so you can copy-paste it
 * back to me when something breaks.
 *
 * AUTO-RECOVERY for Firestore SDK assertions:
 *
 * Firebase Firestore 10.x has a well-known bug where it throws
 * "FIRESTORE (VERSION) INTERNAL ASSERTION FAILED: Unexpected state"
 * out of nowhere — usually after the tab has been backgrounded, after
 * a network flap, or after rapid listener churn. See Firebase GitHub
 * issues #7496, #7937, #8250, and many more. This is NOT an app bug;
 * it's a documented regression in the SDK's internal state machine.
 *
 * Manual recovery = reload the page (re-initializes the Firestore
 * client). We do that automatically here: when the boundary catches
 * an error whose message matches the Firestore assertion pattern,
 * we force `window.location.reload()` after a tiny delay. The user
 * sees a brief flash and everything works again.
 *
 * For OTHER errors (app bugs, render errors, etc.) we keep the
 * manual behavior: show the fallback, include a visible "Recharger"
 * button so the user can recover without hunting for the browser
 * reload, and log the error.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Optional label prefixed to the console log */
  label?: string
}

interface State {
  hasError: boolean
  message?: string
  /** True when the error is a Firestore SDK assertion → auto-recover */
  firestoreAssertion?: boolean
}

/**
 * Returns true when the error looks like the Firestore 10.x internal
 * assertion. We match flexibly so future version strings (10.15, 11.x)
 * keep working, but the "INTERNAL ASSERTION FAILED" phrase is the
 * actual signature.
 */
function isFirestoreAssertion(err: unknown): boolean {
  if (!err) return false
  const msg = (err as Error)?.message ?? String(err)
  return (
    msg.includes('FIRESTORE') &&
    msg.includes('INTERNAL ASSERTION FAILED')
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }
  private reloadTimer: number | null = null

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
      firestoreAssertion: isFirestoreAssertion(error),
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const tag = this.props.label ?? 'ErrorBoundary'
    console.error(`[${tag}] caught:`, error)
    console.error(`[${tag}] component stack:`, info.componentStack)

    // If this is the known Firestore SDK bug, schedule an automatic
    // soft reload. 800ms lets the error log print first so we can
    // see it in the console if Ludosky is debugging.
    if (isFirestoreAssertion(error) && typeof window !== 'undefined') {
      console.warn(
        `[${tag}] Firestore SDK assertion detected — auto-reloading the page in 800ms to recover.`
      )
      this.reloadTimer = window.setTimeout(() => {
        window.location.reload()
      }, 800)
    }
  }

  componentWillUnmount() {
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // Firestore assertion path: show a lightweight "recovering"
      // message because the reload is already scheduled. User sees
      // this for ~800ms before the page reloads itself.
      if (this.state.firestoreAssertion) {
        return (
          <div className="rounded-md bg-info-bg/40 border border-navy/20 p-4 m-4">
            <div className="flex items-start gap-2">
              <RotateCw className="h-5 w-5 text-navy shrink-0 mt-0.5 animate-spin" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-navy text-[0.875rem]">
                  Reconnexion en cours…
                </p>
                <p className="text-[0.8125rem] text-ink-600 mt-1 leading-snug">
                  La connexion à la base de données a été interrompue.
                  La page se recharge automatiquement.
                </p>
              </div>
            </div>
          </div>
        )
      }

      // Generic error path: surface the message + a reload button so
      // the user can recover without hunting through browser menus.
      return (
        <div className="rounded-md bg-danger-bg/40 border border-danger/30 p-4 m-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-danger text-[0.875rem]">
                Une erreur est survenue.
              </p>
              <p className="text-[0.8125rem] text-danger/90 mt-1 leading-snug">
                Le contenu n'a pas pu s'afficher. Voir la console du navigateur
                pour les détails.
              </p>
              {this.state.message && (
                <p className="text-[0.7rem] text-danger/70 mt-2 font-mono break-all">
                  {this.state.message}
                </p>
              )}
              <button
                type="button"
                onClick={this.handleReload}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-danger text-white px-3 py-1.5 text-[0.78rem] font-semibold hover:bg-danger/90 transition-colors min-h-[2.25rem]"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                Recharger
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
