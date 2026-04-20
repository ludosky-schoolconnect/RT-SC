/**
 * RT-SC · Auth & session types.
 * Single source of truth for "who is logged in and as what".
 */

import type { User } from 'firebase/auth'
import type { Professeur } from './models'

export type Role = 'admin' | 'prof' | 'eleve' | 'parent' | null

/** Element session (stored in localStorage as `sc_eleve_session`) */
export interface EleveSession {
  /** Always the Firestore eleve doc id */
  eleveId: string
  classeId: string
  classeNom: string
  nom: string
  /** Firebase anonymous UID — used to satisfy Firestore write rules */
  uid: string
}

/** One linked child (one passkey = one entry) */
export interface ParentChild {
  eleveId: string
  classeId: string
  classeNom: string
  nom: string
  genre: string
}

/**
 * Parent session — multi-child. One parent device can hold links to
 * several children (different passkeys, all stored together).
 *
 * Persisted to localStorage. Parents typically use personal devices
 * (unlike school computers used by élèves), and the auth gate is the
 * passkey. Persistence saves them re-entering codes on every visit.
 */
export interface ParentSession {
  children: ParentChild[]
  /** Index into `children` of the currently-displayed child */
  activeIndex: number
  /** Anonymous Firebase Auth uid for the parent's session */
  uid: string
}

/** What the AuthProvider exposes via Zustand */
export interface AuthState {
  /** Firebase Auth user (admin/prof) */
  user: User | null
  /** Firestore profile (admin/prof) */
  profil: Professeur | null
  /** Élève session (anonymous Firebase + localStorage) */
  eleveSession: EleveSession | null
  /** Parent session (anonymous Firebase + memory) */
  parentSession: ParentSession | null
  /** Resolved role */
  role: Role
  /** True until first onAuthStateChanged callback fires */
  hydrating: boolean

  // Actions
  setUser: (user: User | null) => void
  setProfil: (profil: Professeur | null) => void
  setEleveSession: (s: EleveSession | null) => void
  setParentSession: (s: ParentSession | null) => void
  setHydrated: () => void
  reset: () => void
}
