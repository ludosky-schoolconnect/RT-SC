/**
 * RT-SC · ProtectedRoute.
 *
 * The ONLY component allowed to redirect based on auth state.
 * Apps wrap their dashboard routes with <ProtectedRoute role="admin">…</ProtectedRoute>.
 *
 * Behavior:
 *  - While auth is hydrating: render a tiny placeholder (no flash to login)
 *  - If role mismatch: redirect to /welcome
 *  - If prof but `statut === 'en_attente'`: redirect to /prof/en-attente
 *  - Otherwise: render children
 */

import { Navigate } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuth } from '@/stores/auth'
import type { Role } from '@/types/roles'

interface Props {
  role: Exclude<Role, null>
  /** When true and the prof is en_attente, redirect to the waiting screen */
  enforceProfActif?: boolean
  children: ReactNode
}

export function ProtectedRoute({ role, enforceProfActif = true, children }: Props) {
  const { hydrating, role: currentRole, profil } = useAuth()

  if (hydrating) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy">
        <div className="h-2 w-32 bg-white/15 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-gold rounded-full animate-pulse" />
        </div>
      </div>
    )
  }

  if (currentRole !== role) {
    return <Navigate to="/welcome" replace />
  }

  if (
    role === 'prof' &&
    enforceProfActif &&
    profil &&
    profil.statut === 'en_attente'
  ) {
    return <Navigate to="/prof/en-attente" replace />
  }

  return <>{children}</>
}
