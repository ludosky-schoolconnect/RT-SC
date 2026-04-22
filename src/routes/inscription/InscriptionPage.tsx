/**
 * RT-SC · Public pre-inscription portal.
 *
 * Unauthenticated route at `/inscription`. Two modes accessible via
 * toggle at top:
 *
 *   1. **Soumettre un dossier** — full form: élève identity + niveau +
 *      parent contact + category (if configured) + documents. On
 *      submit, creates `/pre_inscriptions/{auto}` and uploads each
 *      compressed document to the `documents` subcollection. Shows
 *      the generated trackingCode on success.
 *
 *   2. **Suivre mon dossier** — enter tracking code, see current state:
 *      - En attente → soft waiting message
 *      - Approuvé → RV date prominent + Reprogrammer button (cap 3)
 *      - Refusé → reason displayed
 *      - Inscrit Officiellement → welcome
 *
 * Mobile-first single-column layout. Every tap target ≥44×44px.
 * Firestore rules already permit unauth create+read on
 * `/pre_inscriptions/*` and `/settings_inscription/config`.
 */

import { useState } from 'react'
import { FileCheck, Search, DoorClosed } from 'lucide-react'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useSettingsInscription } from '@/hooks/useSettingsInscription'
import { cn } from '@/lib/cn'
import { InscriptionFormPanel } from './InscriptionFormPanel'
import { InscriptionTrackingPanel } from './InscriptionTrackingPanel'

type Mode = 'soumettre' | 'suivre'

export default function InscriptionPage() {
  const [mode, setMode] = useState<Mode>('soumettre')
  const { data: ecole } = useEcoleConfig()
  const { data: settings } = useSettingsInscription()

  // Default OPEN when undefined (backward compat for schools that
  // haven't seen this field yet). Admin must explicitly flip false.
  const inscriptionsOpen = settings?.preinscriptionsOuvertes !== false

  return (
    <div className="min-h-dvh bg-gradient-to-b from-ink-50/40 via-white to-ink-50/40">
      {/* Header */}
      <header className="bg-white border-b border-ink-100 shadow-sm">
        <div className="mx-auto max-w-2xl px-4 py-5 text-center">
          <div className="flex justify-center mb-2">
            <SchoolConnectLogo className="h-9" />
          </div>
          {ecole?.nom && (
            <p className="text-[0.78rem] uppercase font-bold tracking-widest text-gold-dark mb-1">
              {ecole.nom}
            </p>
          )}
          <h1 className="font-display text-[1.6rem] sm:text-[1.9rem] font-bold text-navy leading-tight">
            Portail d'inscription
          </h1>
          <p className="text-[0.85rem] text-ink-500 mt-1">
            Pré-inscrivez votre enfant en ligne.
          </p>
          {(ecole?.adresse || ecole?.telephone) && (
            <p className="text-[0.72rem] text-ink-500 mt-2">
              {ecole.adresse}
              {ecole.adresse && ecole.telephone && ' · '}
              {ecole.telephone}
            </p>
          )}
        </div>
      </header>

      {/* Mode switcher */}
      <div className="mx-auto max-w-2xl px-4 pt-5">
        <div className="inline-flex items-center gap-1 rounded-lg bg-white p-1 border border-ink-100 shadow-sm">
          <ModeBtn
            active={mode === 'soumettre'}
            icon={<FileCheck className="h-4 w-4" />}
            label="Soumettre un dossier"
            onClick={() => setMode('soumettre')}
          />
          <ModeBtn
            active={mode === 'suivre'}
            icon={<Search className="h-4 w-4" />}
            label="Suivre mon dossier"
            onClick={() => setMode('suivre')}
          />
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
        {mode === 'soumettre' &&
          (inscriptionsOpen ? (
            <InscriptionFormPanel />
          ) : (
            <InscriptionsClosedNotice schoolName={ecole?.nom} />
          ))}
        {mode === 'suivre' && <InscriptionTrackingPanel />}
      </main>
    </div>
  )
}

// ─── Closed notice ────────────────────────────────────────────
// Shown when admin has flipped preinscriptionsOuvertes to false.
// The form is NOT rendered — even if someone bypasses this JS via
// F12, Firestore rules server-side reject writes to /pre_inscriptions.

function InscriptionsClosedNotice({ schoolName }: { schoolName?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white shadow-sm p-6 sm:p-10 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-ink-100 flex items-center justify-center mb-5">
        <DoorClosed className="h-8 w-8 text-ink-500" aria-hidden />
      </div>
      <h2 className="font-display text-[1.4rem] sm:text-[1.6rem] font-bold text-navy mb-3 leading-tight">
        Pré-inscriptions actuellement fermées
      </h2>
      <p className="text-[0.9rem] text-ink-600 leading-relaxed max-w-md mx-auto mb-4">
        {schoolName ? (
          <>
            <strong>{schoolName}</strong> n'accepte pas de nouvelles
            demandes de pré-inscription pour le moment.
          </>
        ) : (
          <>
            L'établissement n'accepte pas de nouvelles demandes de
            pré-inscription pour le moment.
          </>
        )}
      </p>
      <p className="text-[0.82rem] text-ink-500 leading-relaxed max-w-md mx-auto">
        Merci de revenir plus tard ou de contacter directement
        l'administration pour connaître les dates d'ouverture.
      </p>
      <div className="mt-6 pt-5 border-t border-ink-100">
        <p className="text-[0.75rem] text-ink-500">
          Vous avez déjà un dossier en cours&nbsp;? Utilisez l'onglet{' '}
          <strong>Suivre mon dossier</strong> avec votre code de suivi.
        </p>
      </div>
    </div>
  )
}

// ─── Mode button ──────────────────────────────────────────────

function ModeBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[0.82rem] font-semibold transition-all min-h-touch',
        active
          ? 'bg-navy text-white shadow-sm'
          : 'text-ink-600 hover:text-navy'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
