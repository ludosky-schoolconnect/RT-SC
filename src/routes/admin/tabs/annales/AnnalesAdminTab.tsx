/**
 * RT-SC · AnnalesAdminTab.
 *
 * Thin wrapper over the shared AnnalesTab in admin mode. Admin can
 * edit/delete any annale.
 */

import { useAuthStore } from '@/stores/auth'
import { AnnalesTab } from '@/routes/_shared/annales/AnnalesTab'
import { EmptyState } from '@/components/ui/EmptyState'
import { Shield } from 'lucide-react'

export function AnnalesAdminTab() {
  const profil = useAuthStore((s) => s.profil)

  if (!profil) {
    return (
      <div className="px-4 py-12">
        <EmptyState
          icon={<Shield className="h-8 w-8" />}
          title="Session indisponible"
          description="Veuillez vous reconnecter."
        />
      </div>
    )
  }

  return (
    <AnnalesTab
      mode="admin"
      currentUser={{
        uid: profil.id,
        displayName: profil.nom ?? 'Administrateur',
        role: 'admin',
      }}
    />
  )
}
