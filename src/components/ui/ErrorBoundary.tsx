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
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Optional label prefixed to the console log */
  label?: string
}

interface State {
  hasError: boolean
  message?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const tag = this.props.label ?? 'ErrorBoundary'
    console.error(`[${tag}] caught:`, error)
    console.error(`[${tag}] component stack:`, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
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
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
