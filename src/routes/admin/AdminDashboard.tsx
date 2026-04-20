/**
 * RT-SC · Admin dashboard.
 *
 * Wires the shared DashboardLayout with the 4 admin tabs:
 *   - Classes (real, Phase 3a)
 *   - Élèves  (placeholder, comes in Phase 3b)
 *   - Profs   (placeholder, comes in Phase 3c)
 *   - Année   (placeholder, comes in Phase 3d)
 *
 * The school name shown in the header comes from /ecole/config.
 * The active tab is URL-driven (?tab=classes), so refreshing or sharing
 * a link keeps you on the same tab.
 */

import {
  School as SchoolIcon,
  GraduationCap,
  BookOpen,
  CalendarDays,
  CalendarClock,
  CalendarOff,
  Megaphone,
} from 'lucide-react'
import { DashboardLayout, type DashboardTab } from '@/components/layout/DashboardLayout'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useClasses } from '@/hooks/useClasses'
import { ClassesTab } from './tabs/classes/ClassesTab'
import { ElevesTab } from './tabs/eleves/ElevesTab'
import { ProfsTab } from './tabs/profs/ProfsTab'
import { AnneeTab } from './tabs/annee/AnneeTab'
import { AnnoncesAdminTab } from './tabs/annonces/AnnoncesAdminTab'
import { EmploiAdminTab } from './tabs/emploi/EmploiAdminTab'
import { VieScolaireTab } from '@/routes/_shared/absences/VieScolaireTab'
import { TabPlaceholder } from './tabs/TabPlaceholder'

const TABS: DashboardTab[] = [
  { id: 'classes',  label: 'Classes',  icon: <SchoolIcon className="h-full w-full" /> },
  { id: 'eleves',   label: 'Élèves',   icon: <GraduationCap className="h-full w-full" /> },
  { id: 'profs',    label: 'Profs',    icon: <BookOpen className="h-full w-full" /> },
  { id: 'vie',      label: 'Vie',      icon: <CalendarOff className="h-full w-full" /> },
  { id: 'emploi',   label: 'Emploi',   icon: <CalendarClock className="h-full w-full" /> },
  { id: 'annonces', label: 'Annonces', icon: <Megaphone className="h-full w-full" /> },
  { id: 'annee',    label: 'Année',    icon: <CalendarDays className="h-full w-full" /> },
]

export default function AdminDashboard() {
  const { data: config } = useEcoleConfig()
  const { data: allClasses = [] } = useClasses()

  return (
    <DashboardLayout
      roleLabel="Administration"
      schoolName={config?.nom}
      tabs={TABS}
      defaultTab="classes"
      renderTab={(activeTab) => {
        switch (activeTab) {
          case 'classes':
            return <ClassesTab />
          case 'eleves':
            return <ElevesTab />
          case 'profs':
            return <ProfsTab />
          case 'vie':
            return (
              <VieScolaireTab
                availableClasses={allClasses}
                canManage={true}
                description="Vue école entière. Vous pouvez valider, refuser ou supprimer les déclarations."
              />
            )
          case 'emploi':
            return <EmploiAdminTab />
          case 'annonces':
            return <AnnoncesAdminTab />
          case 'annee':
            return <AnneeTab />
          default:
            return <TabPlaceholder tabId={activeTab} />
        }
      }}
    />
  )
}
