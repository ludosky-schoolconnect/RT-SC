/**
 * RT-SC · "Where am I Professeur Principal?" derivation hook.
 *
 * Pure derivation from the auth profile + classes list. No new query.
 * Returns the subset of classes where the signed-in prof is the
 * profPrincipalId.
 *
 * Used by:
 *   - Header role indicator
 *   - Notes tab mode switcher (only shows "Bulletins" mode if PP somewhere)
 *   - Bulletins tab content (Phase 4c-ii)
 */

import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useClasses } from '@/hooks/useClasses'
import type { Classe } from '@/types/models'

export function useMyPPClasses(): {
  isPP: boolean
  ppClasses: Classe[]
} {
  const profil = useAuthStore((s) => s.profil)
  const { data: allClasses = [] } = useClasses()

  return useMemo(() => {
    if (!profil) return { isPP: false, ppClasses: [] }
    const ppClasses = allClasses.filter(
      (c) => c.profPrincipalId === profil.id
    )
    return { isPP: ppClasses.length > 0, ppClasses }
  }, [profil, allClasses])
}
