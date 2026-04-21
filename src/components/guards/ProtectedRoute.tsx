/**
 * RT-SC · ProtectedRoute.
 *
 * The ONLY component allowed to redirect based on auth state.
 * Apps wrap their dashboard routes with <ProtectedRoute role="admin">…</ProtectedRoute>.
 *
 * Behavior:
 *  - While auth is hydrating: render a tiny placeholder (no flash to login)
 *  - If role mismatch and user has ANOTHER valid role (e.g. admin
 *    demoted their caissier to prof mid-session), route them to their
 *    new role's landing. This implements "live role-change reroute"
 *    so nobody stays trapped on a surface they no longer have rights
 *    for.
 *  - If role mismatch and no session at all, redirect to /welcome.
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

// Where each role "lives" by default. Used to reroute the user whose
// role changed while they were logged in (Option B of 6d).
const HOME_BY_ROLE: Record<Exclude<Role, null>, string> = {
  admin: '/admin',
  prof: '/prof',
  caissier: '/caissier',
  eleve: '/eleve',
  parent: '/parent',
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
    // If the user has a different valid role, take them there.
    // Otherwise (no session), back to the welcome splash.
    if (currentRole && currentRole !== null) {
      return <Navigate to={HOME_BY_ROLE[currentRole]} replace />
    }
    return <Navigate to="/welcome" replace />
  }

  // En-attente gate — applies to both prof and caissier roles since
  // both go through admin approval. Same waiting screen works for
  // both (generic "en attente d'approbation" message).
  if (
    (role === 'prof' || role === 'caissier') &&
    enforceProfActif &&
    profil &&
    profil.statut === 'en_attente'
  ) {
    return <Navigate to="/prof/en-attente" replace />
  }

  return <>{children}</>
}
