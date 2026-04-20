/**
 * RT-SC · ParentApp.
 *
 * Three tabs (per active child):
 *   - Accueil:   greeting + featured bulletin + Heures de colle widget
 *   - Bulletins: full bulletin list with viewer/PDF download
 *   - Plus:      child switcher, "+ ajouter un enfant", logout, future modules
 *
 * Multi-child support: ParentSession holds a `children[]` array. The
 * Plus tab includes a switcher (when > 1) for swapping the active child.
 * "+ Ajouter un enfant" routes back to the login screen which detects an
 * existing session and appends the new child instead of replacing.
 *
 * No session → redirect to /auth/parent.
 */

import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import {
  Home, FileText, CalendarClock, CalendarOff, MoreHorizontal, UserPlus, LogOut, Users, Check,
  ChevronRight,
} from 'lucide-react'
import { DashboardLayout, type DashboardTab } from '@/components/layout/DashboardLayout'
import { useAuthStore } from '@/stores/auth'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { ParentAccueilTab } from '@/routes/_shared/ParentAccueilTab'
import { BulletinsTab } from '@/routes/_shared/bulletins/BulletinsTab'
import { EmploiClasseTab } from '@/routes/_shared/emploi/EmploiClasseTab'
import { AbsencesTab } from '@/routes/_shared/absences/AbsencesTab'
import { Section, SectionHeader } from '@/components/layout/Section'
import { cn } from '@/lib/cn'

const TABS: DashboardTab[] = [
  { id: 'accueil', label: 'Accueil', icon: <Home className="h-5 w-5" /> },
  { id: 'bulletins', label: 'Bulletins', icon: <FileText className="h-5 w-5" /> },
  { id: 'emploi', label: 'Emploi', icon: <CalendarClock className="h-5 w-5" /> },
  { id: 'absences', label: 'Absences', icon: <CalendarOff className="h-5 w-5" /> },
  { id: 'plus', label: 'Plus', icon: <MoreHorizontal className="h-5 w-5" /> },
]

export default function ParentApp() {
  const parentSession = useAuthStore((s) => s.parentSession)
  const setParentSession = useAuthStore((s) => s.setParentSession)
  const { data: ecoleConfig } = useEcoleConfig()
  const [, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  // No session at all → bounce to the passkey screen
  if (!parentSession || parentSession.children.length === 0) {
    return <Navigate to="/auth/parent" replace />
  }

  // Sanity-clamp activeIndex (in case localStorage was tampered with)
  const activeIndex = Math.min(
    Math.max(0, parentSession.activeIndex),
    parentSession.children.length - 1
  )
  const activeChild = parentSession.children[activeIndex]

  function navigateToTab(tabId: string) {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp)
      next.set('tab', tabId)
      return next
    })
  }

  function switchToChild(idx: number) {
    if (!parentSession) return
    if (idx === activeIndex) return
    setParentSession({ ...parentSession, activeIndex: idx })
    toast.success(`${parentSession.children[idx].nom} sélectionné.`)
    navigateToTab('accueil')
  }

  function addAnotherChild() {
    navigate('/auth/parent')
  }

  async function logout() {
    const ok = await confirm({
      title: 'Se déconnecter ?',
      message:
        parentSession && parentSession.children.length > 1
          ? `Toutes les sessions (${parentSession.children.length} enfants) seront effacées de cet appareil. Vous devrez ressaisir les codes parents pour vous reconnecter.`
          : 'La session sera effacée de cet appareil. Vous devrez ressaisir le code parent pour vous reconnecter.',
      confirmLabel: 'Se déconnecter',
      variant: 'danger',
    })
    if (!ok) return
    setParentSession(null)
    navigate('/welcome', { replace: true })
  }

  async function removeChild(idx: number) {
    if (!parentSession) return
    const child = parentSession.children[idx]
    const ok = await confirm({
      title: `Retirer ${child.nom} ?`,
      message: `${child.nom} sera retiré de votre liste. Vous pourrez le rajouter plus tard avec son code parent.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    })
    if (!ok) return
    const nextChildren = parentSession.children.filter((_, i) => i !== idx)
    if (nextChildren.length === 0) {
      // Last one removed → effectively logout
      setParentSession(null)
      navigate('/welcome', { replace: true })
      return
    }
    const nextActive = idx < activeIndex ? activeIndex - 1 : Math.min(activeIndex, nextChildren.length - 1)
    setParentSession({
      ...parentSession,
      children: nextChildren,
      activeIndex: nextActive,
    })
    toast.success(`${child.nom} retiré.`)
  }

  // Parent intro for the Bulletins tab
  const intro = `Bulletins de ${activeChild.nom}`

  return (
    <DashboardLayout
      roleLabel="Parent"
      schoolName={ecoleConfig?.nom}
      tabs={TABS}
      defaultTab="accueil"
      renderTab={(activeTab) => {
        if (activeTab === 'accueil') {
          return (
            <>
              {parentSession.children.length > 1 && (
                <ChildSwitcherStrip
                  children={parentSession.children}
                  activeIndex={activeIndex}
                  onSwitch={switchToChild}
                />
              )}
              <ParentAccueilTab
                classeId={activeChild.classeId}
                classeNom={activeChild.classeNom}
                eleveId={activeChild.eleveId}
                eleveName={activeChild.nom}
                anneeScolaire={ecoleConfig?.anneeActive}
                onNavigateToEmploi={() => navigateToTab('emploi')}
              />
            </>
          )
        }
        if (activeTab === 'bulletins') {
          return (
            <>
              {parentSession.children.length > 1 && (
                <ChildSwitcherStrip
                  children={parentSession.children}
                  activeIndex={activeIndex}
                  onSwitch={switchToChild}
                />
              )}
              <BulletinsTab
                classeId={activeChild.classeId}
                classeNom={activeChild.classeNom}
                eleveId={activeChild.eleveId}
                eleveName={activeChild.nom}
                intro={intro}
              />
            </>
          )
        }
        if (activeTab === 'emploi') {
          return (
            <>
              {parentSession.children.length > 1 && (
                <ChildSwitcherStrip
                  children={parentSession.children}
                  activeIndex={activeIndex}
                  onSwitch={switchToChild}
                />
              )}
              <EmploiClasseTab
                classeId={activeChild.classeId}
                intro={`Semaine de ${activeChild.nom.split(/\s+/)[0]}`}
              />
            </>
          )
        }
        if (activeTab === 'absences') {
          return (
            <>
              {parentSession.children.length > 1 && (
                <ChildSwitcherStrip
                  children={parentSession.children}
                  activeIndex={activeIndex}
                  onSwitch={switchToChild}
                />
              )}
              <AbsencesTab
                classeId={activeChild.classeId}
                classeNom={activeChild.classeNom}
                eleveId={activeChild.eleveId}
                eleveName={activeChild.nom}
                declaredByUid={parentSession.uid}
                mode="parent"
              />
            </>
          )
        }
        return (
          <PlusTab
            session={parentSession}
            activeIndex={activeIndex}
            onSwitch={switchToChild}
            onAddChild={addAnotherChild}
            onRemoveChild={removeChild}
            onLogout={logout}
          />
        )
      }}
    />
  )
}

// ─── Child switcher strip (top of Accueil + Bulletins when ≥2) ──

function ChildSwitcherStrip({
  children,
  activeIndex,
  onSwitch,
}: {
  children: { eleveId: string; nom: string; classeNom: string }[]
  activeIndex: number
  onSwitch: (idx: number) => void
}) {
  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
        <Users className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
        {children.map((c, i) => {
          const active = i === activeIndex
          return (
            <button
              key={c.eleveId}
              type="button"
              onClick={() => onSwitch(i)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-[0.78rem] font-semibold transition-all',
                active
                  ? 'bg-navy text-white ring-2 ring-navy/20'
                  : 'bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-navy'
              )}
            >
              {c.nom.split(/\s+/)[0]}
              {!active && (
                <span className="text-[0.65rem] text-ink-400 font-normal ml-1">
                  · {c.classeNom}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Plus tab (settings: children list, add, logout) ────────

function PlusTab({
  session,
  activeIndex,
  onSwitch,
  onAddChild,
  onRemoveChild,
  onLogout,
}: {
  session: NonNullable<ReturnType<typeof useAuthStore.getState>['parentSession']>
  activeIndex: number
  onSwitch: (idx: number) => void
  onAddChild: () => void
  onRemoveChild: (idx: number) => void
  onLogout: () => void
}) {
  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-6 pb-12 space-y-6">
      <Section>
        <SectionHeader
          title="Mes enfants"
          description={
            session.children.length === 1
              ? '1 enfant lié à cet appareil.'
              : `${session.children.length} enfants liés à cet appareil. Tapez pour basculer.`
          }
        />
        <div className="rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] divide-y divide-ink-100 overflow-hidden">
          {session.children.map((c, i) => {
            const active = i === activeIndex
            return (
              <div key={c.eleveId} className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSwitch(i)}
                  className="flex-1 flex items-center gap-3 text-left min-h-touch"
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      active
                        ? 'bg-navy text-white ring-2 ring-gold/40'
                        : 'bg-ink-100 text-ink-600'
                    )}
                  >
                    {active ? (
                      <Check className="h-4 w-4" aria-hidden />
                    ) : (
                      <span className="text-[0.78rem] font-bold">
                        {c.nom.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[0.95rem] text-navy font-bold leading-tight truncate">
                      {c.nom}
                    </p>
                    <p className="text-[0.7rem] text-ink-500 mt-0.5">
                      {c.classeNom}
                      {active && (
                        <span className="ml-1.5 text-gold-dark font-semibold">
                          · actif
                        </span>
                      )}
                    </p>
                  </div>
                  {!active && (
                    <ChevronRight className="h-4 w-4 text-ink-300" aria-hidden />
                  )}
                </button>
                {session.children.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveChild(i)}
                    aria-label={`Retirer ${c.nom}`}
                    className="text-[0.7rem] text-ink-400 hover:text-danger px-2 py-1 rounded transition-colors !min-h-0 !min-w-0"
                  >
                    Retirer
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onAddChild}
          className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white ring-1 ring-dashed ring-ink-300 text-[0.875rem] font-semibold text-navy hover:ring-navy hover:bg-info-bg/30 transition-all min-h-touch"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Ajouter un enfant
        </button>
      </Section>

      <Section>
        <SectionHeader title="Compte" />
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white ring-1 ring-ink-100 text-[0.875rem] font-semibold text-danger hover:ring-danger/40 hover:bg-danger-bg/30 transition-all min-h-touch"
        >
          <span className="inline-flex items-center gap-2">
            <LogOut className="h-4 w-4" aria-hidden />
            Se déconnecter
          </span>
          <ChevronRight className="h-4 w-4 text-ink-300" aria-hidden />
        </button>
      </Section>
    </div>
  )
}
