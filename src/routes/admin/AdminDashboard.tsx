/**
 * RT-SC · Admin dashboard.
 *
 * All admin destinations in ONE flat tab list. The DashboardLayout
 * handles responsive overflow: on a wide desktop, every tab renders
 * directly; on a narrow screen, the excess collapses into a "Plus"
 * menu automatically.
 *
 * Destinations (in priority order — the most-used come first so
 * they're always visible even on narrow screens):
 *   1. Classes   — roster setup
 *   2. Élèves    — student directory
 *   3. Profs     — staff directory + passkeys
 *   4. Vie       — daily absences + appels monitoring
 *   5. Inscriptions — demandes + rendez-vous (no guichet — that's caissier)
 *   6. Emploi    — emploi du temps
 *   7. Annonces  — school-wide communications
 *   8. Année     — config, frais de scolarité, rollover, archives
 *
 * Admin has NO access to Finances (terminal de caisse) or Guichet
 * (those are caissier-exclusive in Phase 6d).
 */

import {
  School as SchoolIcon,
  GraduationCap,
  BookOpen,
  CalendarDays,
  CalendarClock,
  CalendarOff,
  Megaphone,
  UserPlus,
  CreditCard,
  Library,
  Award,
  Trophy,
  BarChart3,
  MonitorPlay,
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
import { InscriptionsAdminTab } from './tabs/inscriptions/InscriptionsAdminTab'
import { AbonnementTab } from './tabs/abonnement/AbonnementTab'
import { AnnalesAdminTab } from './tabs/annales/AnnalesAdminTab'
import { CivismeAdminTab } from './tabs/civisme/CivismeAdminTab'
import { PalmaresAdminTab } from './tabs/palmares/PalmaresAdminTab'
import { AnalytiquesTab } from './tabs/analytiques/AnalytiquesTab'
import { VisioHostTab } from '@/routes/_shared/visio/VisioHostTab'
import { VieScolaireTab } from '@/routes/_shared/absences/VieScolaireTab'
import { TabPlaceholder } from './tabs/TabPlaceholder'

import { RolloverNagBanner } from './RolloverNagBanner'

const TABS: DashboardTab[] = [
  { id: 'classes',      label: 'Classes',      icon: <SchoolIcon className="h-full w-full" /> },
  { id: 'eleves',       label: 'Élèves',       icon: <GraduationCap className="h-full w-full" /> },
  { id: 'profs',        label: 'Profs',        icon: <BookOpen className="h-full w-full" /> },
  { id: 'vie',          label: 'Vie',          icon: <CalendarOff className="h-full w-full" /> },
  { id: 'inscriptions', label: 'Inscriptions', icon: <UserPlus className="h-full w-full" /> },
  { id: 'emploi',       label: 'Emploi',       icon: <CalendarClock className="h-full w-full" /> },
  { id: 'annonces',     label: 'Annonces',     icon: <Megaphone className="h-full w-full" /> },
  { id: 'annales',      label: 'Annales',      icon: <Library className="h-full w-full" /> },
  { id: 'civisme',      label: 'Civisme',      icon: <Award className="h-full w-full" /> },
  { id: 'visio',        label: 'Visio',        icon: <MonitorPlay className="h-full w-full" /> },
  { id: 'palmares',     label: 'Palmarès',     icon: <Trophy className="h-full w-full" /> },
  { id: 'analytiques',  label: 'Analytiques',  icon: <BarChart3 className="h-full w-full" /> },
  { id: 'annee',        label: 'Année',        icon: <CalendarDays className="h-full w-full" /> },
  { id: 'abonnement',   label: 'Abonnement',   icon: <CreditCard className="h-full w-full" /> },
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
      extraBanner={(setTab) => (
        <RolloverNagBanner onJumpToAnnee={() => setTab('annee')} />
      )}
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
          case 'inscriptions':
            return <InscriptionsAdminTab />
          case 'emploi':
            return <EmploiAdminTab />
          case 'annonces':
            return <AnnoncesAdminTab />
          case 'annales':
            return <AnnalesAdminTab />
          case 'civisme':
            return <CivismeAdminTab />
          case 'visio':
            return <VisioHostTab scope="admin" />
          case 'palmares':
            return <PalmaresAdminTab />
          case 'analytiques':
            return <AnalytiquesTab />
          case 'annee':
            return <AnneeTab />
          case 'abonnement':
            return <AbonnementTab />
          default:
            return <TabPlaceholder tabId={activeTab} />
        }
      }}
    />
  )
}
