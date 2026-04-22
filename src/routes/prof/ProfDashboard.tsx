/**
 * RT-SC · Prof dashboard.
 *
 * Same adaptive nav pattern as admin (bottom nav on mobile, top tabs on desktop).
 * Four tabs:
 *   - Notes (Phase 4b — daily workflow + Phase 4c-i Saisie/Bulletins modes)
 *   - Mes classes (Phase 4b — read-only overview)
 *   - Annonces (Phase 6 placeholder)
 *   - Plus (Phase 5+ placeholder)
 *
 * The roleLabel surfaces "Prof Principal" when the prof is PP of any
 * assigned class. Phase 4c-ii will gate the Bulletins-mode workflow on
 * the same flag.
 */

import {
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Megaphone,
  CalendarClock,
  CalendarOff,
  Library,
  Award,
  FlaskConical,
  MonitorPlay,
} from 'lucide-react'
import { DashboardLayout, type DashboardTab } from '@/components/layout/DashboardLayout'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useMyPPClasses } from '@/hooks/useMyPPClasses'
import { useClasses } from '@/hooks/useClasses'
import { useAuthStore } from '@/stores/auth'
import { useMemo } from 'react'
import { NotesTab } from './tabs/notes/NotesTab'
import { MesClassesTab } from './tabs/classes/MesClassesTab'
import { AnnoncesProfTab } from './tabs/annonces/AnnoncesProfTab'
import { EmploiProfTab } from './tabs/emploi/EmploiProfTab'
import { AppelProfTab } from './tabs/appel/AppelProfTab'
import { AnnalesProfTab } from './tabs/annales/AnnalesProfTab'
import { CivismeProfTab } from './tabs/civisme/CivismeProfTab'
import { LaboProfTab } from './tabs/labo/LaboProfTab'
import { VisioHostTab } from '@/routes/_shared/visio/VisioHostTab'
import { VieScolaireTab } from '@/routes/_shared/absences/VieScolaireTab'
import { TabPlaceholder } from '../admin/tabs/TabPlaceholder'

const TABS: DashboardTab[] = [
  { id: 'classes',  label: 'Mes classes', icon: <GraduationCap className="h-full w-full" /> },
  { id: 'notes',    label: 'Notes',       icon: <ClipboardList className="h-full w-full" /> },
  { id: 'appel',    label: 'Appel',       icon: <ClipboardCheck className="h-full w-full" /> },
  { id: 'vie',      label: 'Vie',         icon: <CalendarOff className="h-full w-full" /> },
  { id: 'emploi',   label: 'Emploi',      icon: <CalendarClock className="h-full w-full" /> },
  { id: 'annonces', label: 'Annonces',    icon: <Megaphone className="h-full w-full" /> },
  { id: 'annales',  label: 'Annales',     icon: <Library className="h-full w-full" /> },
  { id: 'civisme',  label: 'Civisme',     icon: <Award className="h-full w-full" /> },
  { id: 'labo',     label: 'Labo',        icon: <FlaskConical className="h-full w-full" /> },
  { id: 'visio',    label: 'Visio',       icon: <MonitorPlay className="h-full w-full" /> },
]

export default function ProfDashboard() {
  const { data: config } = useEcoleConfig()
  const { isPP, ppClasses } = useMyPPClasses()
  const profil = useAuthStore((s) => s.profil)
  const { data: allClasses = [] } = useClasses()

  const roleLabel = isPP ? 'Professeur · PP' : 'Professeur'

  const teachingClasses = useMemo(() => {
    const ids = new Set(profil?.classesIds ?? [])
    return allClasses.filter((c) => ids.has(c.id))
  }, [allClasses, profil?.classesIds])

  // PP gets their own PP class as the default selection
  const defaultClasseId = isPP && ppClasses[0] ? ppClasses[0].id : undefined

  return (
    <DashboardLayout
      roleLabel={roleLabel}
      schoolName={config?.nom}
      tabs={TABS}
      defaultTab="classes"
      renderTab={(activeTab) => {
        switch (activeTab) {
          case 'notes':
            return <NotesTab />
          case 'classes':
            return <MesClassesTab />
          case 'appel':
            return <AppelProfTab />
          case 'vie':
            return (
              <VieScolaireTab
                availableClasses={teachingClasses}
                defaultClasseId={defaultClasseId}
                canManage={false}
                description={
                  isPP
                    ? `Suivi de vos classes (${ppClasses[0] ? `votre classe principale ${ppClasses[0].niveau} sélectionnée par défaut` : 'PP'}).`
                    : "Suivi des absences pour vos classes assignées."
                }
              />
            )
          case 'emploi':
            return <EmploiProfTab />
          case 'annonces':
            return <AnnoncesProfTab />
          case 'annales':
            return <AnnalesProfTab />
          case 'civisme':
            return <CivismeProfTab />
          case 'labo':
            return <LaboProfTab />
          case 'visio':
            return <VisioHostTab scope="prof" />
          default:
            return <TabPlaceholder tabId={activeTab} />
        }
      }}
    />
  )
}
