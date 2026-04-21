/**
 * RT-SC · Caissier dashboard.
 *
 * Dedicated surface for a staff member whose role === 'caissier'.
 * Three tabs in the bottom nav (mobile) / top bar (desktop):
 *
 *   1. Terminal — the existing Finances search/trier/paiement flow.
 *      A name-override input in the header lets the caissier type a
 *      preferred display name for receipts (e.g. "Marcel" instead of
 *      "KPETA Marcel Olivier"); the value persists in localStorage.
 *
 *   2. Bilan — the existing BilanGlobalCard with global + per-class
 *      scopes and full PDF/CSV exports.
 *
 *   3. Inscriptions — the existing InscriptionsAdminTab with its
 *      internal Demandes / Rendez-vous / Guichet segmented control.
 *      No changes to that flow; it just lives here now.
 *
 * The admin NO LONGER has access to Finances or Inscriptions (those
 * tiles were removed from the Plus menu). The Firestore rules enforce
 * this at the server: admin CAN still read everything (they're staff),
 * but the dedicated guichet flows are caissier surfaces.
 *
 * On logout, the caissier name override is cleared (handled in
 * stores/auth.ts reset()).
 */

import { useState } from 'react'
import { CreditCard, LineChart, UserPlus, Pencil, Check, X } from 'lucide-react'
import { DashboardLayout, type DashboardTab } from '@/components/layout/DashboardLayout'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useAuth } from '@/stores/auth'
import { useCaissier } from '@/stores/caissier'
import { FinancesAdminTab } from '@/routes/admin/tabs/finances/FinancesAdminTab'
import { BilanGlobalCard } from '@/routes/admin/tabs/finances/BilanGlobalCard'
import { GuichetView } from '@/routes/admin/tabs/inscriptions/GuichetView'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const TABS: DashboardTab[] = [
  { id: 'terminal',     label: 'Terminal', icon: <CreditCard className="h-full w-full" /> },
  { id: 'bilan',        label: 'Bilan',    icon: <LineChart className="h-full w-full" /> },
  { id: 'inscriptions', label: 'Guichet',  icon: <UserPlus className="h-full w-full" /> },
]

export default function CaissierDashboard() {
  const { data: config } = useEcoleConfig()

  return (
    <DashboardLayout
      roleLabel="Caisse"
      schoolName={config?.nom}
      tabs={TABS}
      defaultTab="terminal"
      renderTab={(activeTab) => {
        switch (activeTab) {
          case 'terminal':
            return <TerminalSurface />
          case 'bilan':
            return (
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-3 px-1">
                  Bilan financier
                </p>
                <BilanGlobalCard />
              </div>
            )
          case 'inscriptions':
            return (
              <Section>
                <SectionHeader
                  kicker="Admissions"
                  title="Guichet d'admission"
                  description="Recherchez un dossier par son code de suivi pour encaisser le paiement et inscrire l'élève. Les demandes et rendez-vous sont gérés par l'administration."
                />
                <GuichetView />
              </Section>
            )
          default:
            return null
        }
      }}
    />
  )
}

// ─── Terminal surface — header with caissier name override ────

function TerminalSurface() {
  const { profil, user: authUser } = useAuth()
  const { displayName, setDisplayName } = useCaissier()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayName)

  // Resolved name actually printed on receipts / stamped on paiements.
  // Falls back to profil.nom if no override. Shown in the header as
  // confirmation of what the caissier is operating as this session.
  const resolvedName =
    (displayName && displayName.trim()) ||
    profil?.nom ||
    authUser?.displayName ||
    authUser?.email ||
    'Caissier'

  function startEdit() {
    setDraft(displayName)
    setEditing(true)
  }

  function commit() {
    setDisplayName(draft.trim())
    setEditing(false)
  }

  function cancel() {
    setDraft(displayName)
    setEditing(false)
  }

  return (
    <div className="space-y-4">
      {/* Name-override card */}
      <div className="rounded-lg border border-ink-100 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400 mb-0.5">
              Caissier en poste
            </p>
            {!editing ? (
              <p className="font-display text-[1.05rem] font-bold text-navy truncate">
                {resolvedName}
              </p>
            ) : (
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  else if (e.key === 'Escape') cancel()
                }}
                placeholder={profil?.nom ?? 'Nom à afficher sur les reçus'}
                autoFocus
                maxLength={40}
                className="mt-1"
              />
            )}
            {!editing && displayName && (
              <p className="text-[0.68rem] text-ink-500 mt-0.5">
                Nom personnalisé (officiel : {profil?.nom ?? '—'})
              </p>
            )}
            {!editing && !displayName && (
              <p className="text-[0.68rem] text-ink-500 mt-0.5">
                Utilisez votre prénom ou un surnom pour les reçus si vous
                le souhaitez.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={startEdit}
                leadingIcon={<Pencil className="h-3.5 w-3.5" />}
              >
                Modifier
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={commit}
                  leadingIcon={<Check className="h-3.5 w-3.5" />}
                >
                  OK
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancel}
                  leadingIcon={<X className="h-3.5 w-3.5" />}
                >
                  Annuler
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* The finances search/trier/paiement flow. FinancesAdminTab
          has its own SectionHeader; no extra kicker needed here. */}
      <FinancesAdminTab />
    </div>
  )
}
