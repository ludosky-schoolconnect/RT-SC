/**
 * RT-SC · Pre-inscription open/close toggle.
 *
 * Master switch for the public /inscription form. When closed:
 *   - Public form shows a "closed" notice instead of rendering the UI
 *   - Firestore rules reject any /pre_inscriptions/* create attempt
 *     (F12-proof — the gate is server-enforced)
 *
 * Default state: open. Admin must explicitly flip to close.
 *
 * Stored at /settings_inscription/config.preinscriptionsOuvertes.
 */

import { DoorOpen, DoorClosed, ShieldCheck, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useToast } from '@/stores/toast'
import {
  useSettingsInscription,
  useTogglePreinscriptions,
} from '@/hooks/useSettingsInscription'

export function PreinscriptionToggleCard() {
  const { data: settings, isLoading } = useSettingsInscription()
  const toggleMut = useTogglePreinscriptions()
  const toast = useToast()

  // Default OPEN if undefined (backward compat)
  const ouvertes = settings?.preinscriptionsOuvertes !== false

  async function handleToggle(next: boolean) {
    try {
      await toggleMut.mutateAsync(next)
      toast.success(
        next
          ? 'Pré-inscriptions ouvertes — le formulaire public est actif.'
          : 'Pré-inscriptions fermées — aucune nouvelle soumission acceptée.'
      )
    } catch (err) {
      console.error('[preinscription toggle] error:', err)
      toast.error("Échec de la modification. Réessayez.")
    }
  }

  if (isLoading && !settings) {
    return (
      <Card>
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    )
  }

  return (
    <Card
      className={
        ouvertes
          ? 'border-l-4 border-l-success bg-success-bg/30'
          : 'border-l-4 border-l-ink-400 bg-ink-50/50'
      }
    >
      <div className="flex items-start gap-3.5">
        {/* Icon */}
        <div
          className={
            ouvertes
              ? 'shrink-0 w-10 h-10 rounded-full bg-success/15 flex items-center justify-center'
              : 'shrink-0 w-10 h-10 rounded-full bg-ink-200/60 flex items-center justify-center'
          }
        >
          {ouvertes ? (
            <DoorOpen className="h-5 w-5 text-success-dark" aria-hidden />
          ) : (
            <DoorClosed className="h-5 w-5 text-ink-500" aria-hidden />
          )}
        </div>

        {/* Main text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
            <h3 className="font-semibold text-navy text-[0.95rem]">
              Pré-inscriptions
            </h3>
            <span
              className={
                ouvertes
                  ? 'text-success-dark uppercase tracking-wider text-[0.72rem] font-semibold'
                  : 'text-ink-500 uppercase tracking-wider text-[0.72rem] font-semibold'
              }
            >
              {ouvertes ? 'ouvertes' : 'fermées'}
            </span>
          </div>
          <p className="text-[0.78rem] text-ink-600 leading-relaxed">
            {ouvertes ? (
              <>
                Le formulaire public est <strong>actif</strong>. Les parents
                peuvent soumettre des dossiers. Fermez la bascule pour bloquer
                toute nouvelle soumission.
              </>
            ) : (
              <>
                Le formulaire public est <strong>bloqué</strong>. Aucune
                nouvelle pré-inscription n'est acceptée — ni par le formulaire,
                ni par manipulation technique.
              </>
            )}
          </p>

          {!ouvertes && (
            <div className="mt-2 flex items-start gap-1.5 text-[0.7rem] text-ink-600 bg-white/60 rounded-md px-2 py-1.5 border border-ink-200">
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0 mt-0.5 text-ink-500"
                aria-hidden
              />
              <span className="leading-snug">
                Aucune soumission ne sera acceptée tant que les
                pré-inscriptions resteront fermées.
              </span>
            </div>
          )}

          {ouvertes && (
            <div className="mt-2 flex items-start gap-1.5 text-[0.7rem] text-warning bg-warning-bg/40 rounded-md px-2 py-1.5 border border-warning/20">
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0 mt-0.5"
                aria-hidden
              />
              <span className="leading-snug">
                Quand les inscriptions sont terminées, fermez ce portail pour
                éviter les soumissions indésirables.
              </span>
            </div>
          )}
        </div>

        {/* Toggle — uses shared ToggleSwitch component */}
        <ToggleSwitch
          checked={ouvertes}
          onChange={handleToggle}
          disabled={toggleMut.isPending}
          ariaLabel={
            ouvertes
              ? 'Fermer les pré-inscriptions'
              : 'Ouvrir les pré-inscriptions'
          }
          className="mt-1"
        />
      </div>
    </Card>
  )
}
