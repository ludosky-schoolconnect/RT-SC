/**
 * Vendor · Session context.
 *
 * Holds the "current phase" state machine of the vendor app:
 *
 *   idle       → Screen 1 (school selector)
 *   connecting → spinner while Firebase.initializeApp resolves
 *   auth       → Screen 3 (email + password for that school)
 *   active     → Screen 4 (command center, connected + authenticated)
 *
 * The phase plus a reference to the active Firebase app is everything
 * downstream components need to know. Components consume via the
 * useSession() hook.
 *
 * Lifecycle rules:
 *   - Only ONE Firebase app alive at any time (strategy A from scoping)
 *   - Switching schools: active → idle, which calls disconnectFromSchool()
 *     to tear down the Firebase app before picking another school
 *   - Logging out without switching: active → auth, app stays alive
 *     so we can re-auth on the same school without re-init
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import type { User } from 'firebase/auth'
import {
  connectToSchool,
  disconnectFromSchool,
  type VendorFirebase,
} from './firebase'
import {
  loadSavedSchools,
  markSchoolUsed,
  type SavedSchool,
} from './schoolsStorage'

type Phase =
  | { kind: 'idle' }
  | { kind: 'connecting'; school: SavedSchool }
  | { kind: 'auth'; school: SavedSchool; firebase: VendorFirebase }
  | {
      kind: 'active'
      school: SavedSchool
      firebase: VendorFirebase
      user: User
    }

interface SessionContextValue {
  phase: Phase
  schools: SavedSchool[]
  refreshSchools: () => void
  /** Move from idle → connecting → auth by picking a school */
  pickSchool: (school: SavedSchool) => Promise<void>
  /** Move from auth → active by completing Firebase Auth login */
  completeAuth: (user: User) => void
  /** Log out but stay on the same school (auth phase) */
  logoutKeepSchool: () => Promise<void>
  /** Completely disconnect from current school → back to idle */
  switchSchool: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [schools, setSchools] = useState<SavedSchool[]>(() =>
    loadSavedSchools()
  )

  const refreshSchools = useCallback(() => {
    setSchools(loadSavedSchools())
  }, [])

  const pickSchool = useCallback(async (school: SavedSchool) => {
    setPhase({ kind: 'connecting', school })
    try {
      const firebase = await connectToSchool(school.config)
      setPhase({ kind: 'auth', school, firebase })
    } catch (err) {
      console.error('[session] connectToSchool failed:', err)
      setPhase({ kind: 'idle' })
      throw err
    }
  }, [])

  const completeAuth = useCallback((user: User) => {
    setPhase((p) => {
      if (p.kind !== 'auth') return p
      // Mark school as used (updates lastUsed → sorts to top of list)
      markSchoolUsed(p.school.id)
      setSchools(loadSavedSchools())
      return {
        kind: 'active',
        school: p.school,
        firebase: p.firebase,
        user,
      }
    })
  }, [])

  const logoutKeepSchool = useCallback(async () => {
    setPhase((p) => {
      if (p.kind !== 'active') return p
      // Sign out of Firebase Auth but keep the app alive — we'll land
      // on auth phase with the same school + firebase. No need to
      // re-init the Firebase app.
      void p.firebase.auth.signOut().catch(() => {})
      return { kind: 'auth', school: p.school, firebase: p.firebase }
    })
  }, [])

  const switchSchool = useCallback(async () => {
    // Fully tear down — signOut + deleteApp — then back to idle.
    await disconnectFromSchool()
    setPhase({ kind: 'idle' })
    setSchools(loadSavedSchools())
  }, [])

  const value: SessionContextValue = {
    phase,
    schools,
    refreshSchools,
    pickSchool,
    completeAuth,
    logoutKeepSchool,
    switchSchool,
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
