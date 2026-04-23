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
 *  - Session E7: for personnel roles (admin, prof, caissier), wrap
 *    the children with PersonnelCodeGate (fresh-tab code challenge)
 *    and InactivityGuard (5-min idle/visibility/network re-prompt).
 *    Élève and parent roles are NOT gated — they have their own
 *    auth flows (passkey-based, no personal codes).
 *  - Otherwise: render children
 */

import { Navigate } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { useAuth } from '@/stores/auth'
import { PersonnelCodeGate } from '@/components/auth/PersonnelCodeGate'
import { InactivityGuard } from '@/components/auth/InactivityGuard'
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

// Roles that get the personal-code gate + inactivity guard. These
// are the staff roles whose dashboards expose grades, payments, and
// admin tooling — high-sensitivity surfaces that need defense in
// depth beyond Firebase Auth's persistent session.
const PERSONNEL_ROLES = new Set<Exclude<Role, null>>(['admin', 'prof', 'caissier'])

export function ProtectedRoute({ role, enforceProfActif = true, children }: Props) {
  const { hydrating, role: currentRole, profil } = useAuth()

  // Bumped on inactivity-triggered lock to force re-mount of the
  // gate-wrapped subtree, ensuring PersonnelCodeGate re-reads
  // sessionStorage and shows the prompt.
  const [lockNonce, setLockNonce] = useState(0)

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

  // Personnel roles get the code gate + inactivity guard.
  if (PERSONNEL_ROLES.has(role)) {
    return (
      <>
        <InactivityGuard onLock={() => setLockNonce((n) => n + 1)} />
        <PersonnelCodeGate key={lockNonce}>{children}</PersonnelCodeGate>
      </>
    )
  }

  return <>{children}</>
}
