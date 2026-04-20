/**
 * RT-SC · EleveDashboard.
 *
 * Three tabs:
 *   - Accueil:   greeting + featured bulletin + quick actions (default)
 *   - Bulletins: full list of bulletins with viewer/PDF download
 *   - Plus:      placeholder for future modules (absences, schedule, …)
 *
 * Bulletins is no longer the default tab — Accueil is. Once more
 * modules ship (absences, schedule, etc.), the Plus tab will become a
 * drawer or its own grid of access points.
 */

import { useSearchParams } from 'react-router-dom'
import { Home, FileText, CalendarClock, CalendarOff } from 'lucide-react'
import { DashboardLayout, type DashboardTab } from '@/components/layout/DashboardLayout'
import { useAuthStore } from '@/stores/auth'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { AccueilTab } from '@/routes/_shared/AccueilTab'
import { BulletinsTab } from '@/routes/_shared/bulletins/BulletinsTab'
import { EmploiClasseTab } from '@/routes/_shared/emploi/EmploiClasseTab'
import { AbsencesTab } from '@/routes/_shared/absences/AbsencesTab'
import { EmptyState } from '@/components/ui/EmptyState'

const TABS: DashboardTab[] = [
  { id: 'accueil', label: 'Accueil', icon: <Home className="h-5 w-5" /> },
  { id: 'bulletins', label: 'Bulletins', icon: <FileText className="h-5 w-5" /> },
  { id: 'emploi', label: 'Emploi', icon: <CalendarClock className="h-5 w-5" /> },
  { id: 'absences', label: 'Absences', icon: <CalendarOff className="h-5 w-5" /> },
]

export default function EleveDashboard() {
  const eleveSession = useAuthStore((s) => s.eleveSession)
  const { data: ecoleConfig } = useEcoleConfig()
  const [, setSearchParams] = useSearchParams()

  function navigateToTab(tabId: string) {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp)
      next.set('tab', tabId)
      return next
    })
  }

  if (!eleveSession) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6">
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="Session non disponible"
          description="Veuillez vous reconnecter pour accéder à votre espace."
        />
      </div>
    )
  }

  return (
    <DashboardLayout
      roleLabel="Élève"
      schoolName={ecoleConfig?.nom}
      tabs={TABS}
      defaultTab="accueil"
      renderTab={(activeTab) => {
        if (activeTab === 'accueil') {
          return (
            <AccueilTab
              classeId={eleveSession.classeId}
              classeNom={eleveSession.classeNom}
              eleveId={eleveSession.eleveId}
              eleveName={eleveSession.nom}
              anneeScolaire={ecoleConfig?.anneeActive}
              onNavigateToBulletins={() => navigateToTab('bulletins')}
              onNavigateToEmploi={() => navigateToTab('emploi')}
              onNavigateToPlus={() => navigateToTab('plus')}
            />
          )
        }
        if (activeTab === 'bulletins') {
          return (
            <BulletinsTab
              classeId={eleveSession.classeId}
              classeNom={eleveSession.classeNom}
              eleveId={eleveSession.eleveId}
              eleveName={eleveSession.nom}
            />
          )
        }
        if (activeTab === 'emploi') {
          return <EmploiClasseTab classeId={eleveSession.classeId} intro="Ma semaine" />
        }
        if (activeTab === 'absences') {
          return (
            <AbsencesTab
              classeId={eleveSession.classeId}
              classeNom={eleveSession.classeNom}
              eleveId={eleveSession.eleveId}
              eleveName={eleveSession.nom}
              declaredByUid={eleveSession.uid}
              mode="eleve"
            />
          )
        }
        return null
      }}
    />
  )
}
