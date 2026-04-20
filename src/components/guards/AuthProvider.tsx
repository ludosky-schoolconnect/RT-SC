/**
 * RT-SC · AuthProvider.
 *
 * The ONLY component allowed to subscribe to Firebase onAuthStateChanged.
 * Resolves the role and writes everything into the auth store.
 *
 * No redirects from here — that's ProtectedRoute's job.
 */

import { useEffect, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { auth, docRef } from '@/firebase'
import { professeurDoc } from '@/lib/firestore-keys'
import { useAuthStore } from '@/stores/auth'
import type { Professeur } from '@/types/models'

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const { setUser, setProfil, setHydrated } = useAuthStore()

  useEffect(() => {
    let profilUnsub: Unsubscribe | null = null

    const unsubAuth = onAuthStateChanged(auth, async (user: User | null) => {
      // Anonymous sessions are ignored at this layer; they're only used
      // to satisfy Firestore write rules for élève / parent.
      if (user && user.isAnonymous) {
        setUser(null)
        setProfil(null)
        setHydrated()
        return
      }

      // Detach any previous profil snapshot before switching users.
      if (profilUnsub) {
        profilUnsub()
        profilUnsub = null
      }

      setUser(user)

      if (!user) {
        setProfil(null)
        setHydrated()
        return
      }

      // Live snapshot on the user's professeur doc so that:
      //   - Approval status changes (en_attente → actif) update instantly
      //   - Admin/Prof role changes are picked up
      profilUnsub = onSnapshot(
        docRef(professeurDoc(user.uid)),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Omit<Professeur, 'id'>
            setProfil({ id: snap.id, ...data })
          } else {
            setProfil(null)
          }
          setHydrated()
        },
        (err) => {
          console.error('[AuthProvider] profil snapshot error:', err)
          setProfil(null)
          setHydrated()
        }
      )
    })

    return () => {
      unsubAuth()
      if (profilUnsub) profilUnsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
