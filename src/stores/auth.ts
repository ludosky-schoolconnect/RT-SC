/**
 * RT-SC · Auth store.
 *
 * SINGLE source of truth for authentication state across the app.
 * The AuthProvider component (components/guards/AuthProvider) is the
 * ONLY place that mutates this store from Firebase callbacks.
 * Components read from it via the `useAuth` hook.
 *
 * No redirects happen here — guards (ProtectedRoute, SubscriptionGuard)
 * handle navigation based on what they read from this store.
 */

import { create } from 'zustand'
import type { AuthState, EleveSession, ParentSession, Role } from '@/types/roles'
import type { Professeur } from '@/types/models'
import type { User } from 'firebase/auth'

const ELEVE_SESSION_KEY = 'sc_eleve_session'
const PARENT_SESSION_KEY = 'sc_parent_session'

function loadEleveSession(): EleveSession | null {
  try {
    const raw = localStorage.getItem(ELEVE_SESSION_KEY)
    return raw ? (JSON.parse(raw) as EleveSession) : null
  } catch {
    return null
  }
}

function saveEleveSession(s: EleveSession | null) {
  try {
    if (s) localStorage.setItem(ELEVE_SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(ELEVE_SESSION_KEY)
  } catch {
    // localStorage may be unavailable; ignore silently
  }
}

function loadParentSession(): ParentSession | null {
  try {
    const raw = localStorage.getItem(PARENT_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ParentSession
    // Sanity check the shape — old single-child sessions would be invalid
    if (!Array.isArray(parsed.children) || parsed.children.length === 0) return null
    if (typeof parsed.activeIndex !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function saveParentSession(s: ParentSession | null) {
  try {
    if (s) localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(PARENT_SESSION_KEY)
  } catch {
    // ignore
  }
}

function deriveRole(args: {
  profil: Professeur | null
  eleveSession: EleveSession | null
  parentSession: ParentSession | null
}): Role {
  if (args.profil) return args.profil.role === 'admin' ? 'admin' : 'prof'
  if (args.eleveSession) return 'eleve'
  if (args.parentSession) return 'parent'
  return null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profil: null,
  eleveSession: loadEleveSession(),
  parentSession: loadParentSession(),
  role: deriveRole({
    profil: null,
    eleveSession: loadEleveSession(),
    parentSession: loadParentSession(),
  }),
  hydrating: true,

  setUser: (user: User | null) => {
    set({ user })
  },

  setProfil: (profil: Professeur | null) => {
    const next = {
      profil,
      role: deriveRole({
        profil,
        eleveSession: get().eleveSession,
        parentSession: get().parentSession,
      }),
    }
    set(next)
  },

  setEleveSession: (s: EleveSession | null) => {
    saveEleveSession(s)
    set({
      eleveSession: s,
      role: deriveRole({
        profil: get().profil,
        eleveSession: s,
        parentSession: get().parentSession,
      }),
    })
  },

  setParentSession: (s: ParentSession | null) => {
    saveParentSession(s)
    set({
      parentSession: s,
      role: deriveRole({
        profil: get().profil,
        eleveSession: get().eleveSession,
        parentSession: s,
      }),
    })
  },

  setHydrated: () => set({ hydrating: false }),

  reset: () => {
    saveEleveSession(null)
    set({
      user: null,
      profil: null,
      eleveSession: null,
      parentSession: null,
      role: null,
    })
  },
}))

/** Convenience selector hook */
export const useAuth = () => useAuthStore((s) => s)
