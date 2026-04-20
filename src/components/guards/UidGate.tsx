/**
 * RT-SC · UidGate
 *
 * Renders children only if the currently-signed-in user's Firebase UID
 * matches `VITE_OWNER_UID` from environment. Otherwise renders the same
 * "page not found" view as the app's 404 — so unauthorized visitors can't
 * even tell that the route exists.
 *
 * Used to gate the À propos CMS editor at /__cms/about.
 *
 * The owner UID is read at build time from the env. To change ownership,
 * update .env.local and rebuild.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
import { auth } from '@/firebase'
import { Spinner } from '@/components/ui/Spinner'

interface UidGateProps {
  children: ReactNode
}

const OWNER_UID = (import.meta.env.VITE_OWNER_UID ?? '').trim()

export function UidGate({ children }: UidGateProps) {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading')

  useEffect(() => {
    // Subscribe directly — we don't want to rely on AuthProvider's mount order
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!OWNER_UID) {
        setStatus('denied')
        return
      }
      if (user?.uid && user.uid === OWNER_UID) {
        setStatus('allowed')
      } else {
        setStatus('denied')
      }
    })
    return unsub
  }, [])

  if (status === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white">
        <Spinner size="lg" />
      </div>
    )
  }

  if (status === 'denied') {
    return <NotFoundView />
  }

  return <>{children}</>
}

/**
 * Indistinguishable from the app's 404. Crucially, the same view is shown
 * regardless of whether the user is signed in but with the wrong UID, signed
 * in to nothing, or whether OWNER_UID is unset entirely.
 */
function NotFoundView() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-off-white px-6 text-center">
      <p className="font-display text-7xl font-bold text-navy/15 leading-none">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-navy">
        Page introuvable
      </h1>
      <p className="mt-2 text-ink-600 max-w-sm">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-navy text-white px-5 py-2.5 text-sm font-semibold hover:bg-navy-light transition-colors min-h-touch"
      >
        <Home className="h-4 w-4" aria-hidden />
        Retour à l'accueil
      </Link>
    </div>
  )
}
