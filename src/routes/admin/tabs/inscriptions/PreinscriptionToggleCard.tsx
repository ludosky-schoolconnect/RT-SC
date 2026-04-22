/**
 * RT-SC · Pre-inscription open/close toggle.
 *
 * Master switch for the public /inscription form. When closed:
 *   - Public form shows a "closed" notice instead of rendering the UI
 *   - Firestore rules reject any /pre_inscriptions/* create attempt
 *     (F12-proof — the gate is server-enforced, not just client-hidden)
 *
 * Default state: open. Admin must explicitly flip to close.
 *
 * Stored at /settings_inscription/config.preinscriptionsOuvertes.
 */

import { DoorOpen, DoorClosed, ShieldCheck, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
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

  async function handleToggle() {
    const next = !ouvertes
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
          ? 'border-l-4 border-l-gold bg-gold-pale/30'
          : 'border-l-4 border-l-ink-400 bg-ink-50/50'
      }
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={
            ouvertes
              ? 'shrink-0 w-11 h-11 rounded-full bg-gold/15 flex items-center justify-center'
              : 'shrink-0 w-11 h-11 rounded-full bg-ink-200/60 flex items-center justify-center'
          }
        >
          {ouvertes ? (
            <DoorOpen className="h-5 w-5 text-gold-dark" aria-hidden />
          ) : (
            <DoorClosed className="h-5 w-5 text-ink-500" aria-hidden />
          )}
        </div>

        {/* Main text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-navy text-[0.95rem]">
              Pré-inscriptions{' '}
              <span
                className={
                  ouvertes
                    ? 'text-gold-dark uppercase tracking-wider text-[0.78rem]'
                    : 'text-ink-500 uppercase tracking-wider text-[0.78rem]'
                }
              >
                {ouvertes ? 'ouvertes' : 'fermées'}
              </span>
            </h3>
          </div>
          <p className="text-[0.78rem] text-ink-600 leading-relaxed">
            {ouvertes ? (
              <>
                Le formulaire public est <strong>actif</strong>. Les parents
                peuvent soumettre des dossiers d'inscription. Fermez la
                bascule pour bloquer toute nouvelle soumission.
              </>
            ) : (
              <>
                Le formulaire public est <strong>bloqué</strong>. Aucune
                nouvelle pré-inscription n'est acceptée — ni par le
                formulaire, ni par manipulation technique. Ouvrez la
                bascule pour recevoir à nouveau des dossiers.
              </>
            )}
          </p>

          {/* F12-proof reassurance — small print */}
          {!ouvertes && (
            <div className="mt-2 flex items-start gap-1.5 text-[0.7rem] text-success-dark bg-success-bg/50 rounded-md px-2 py-1.5 border border-success/20">
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0 mt-0.5"
                aria-hidden
              />
              <span className="leading-snug">
                Protection serveur active : les règles Firestore refusent
                toute création, même via manipulation de la console.
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
                Quand les inscriptions sont terminées, fermez ce portail
                pour éviter les soumissions indésirables.
              </span>
            </div>
          )}
        </div>

        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={ouvertes}
          aria-label={
            ouvertes ? 'Fermer les pré-inscriptions' : 'Ouvrir les pré-inscriptions'
          }
          onClick={handleToggle}
          disabled={toggleMut.isPending}
          className={
            ouvertes
              ? 'relative shrink-0 w-14 h-8 rounded-full bg-gold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2'
              : 'relative shrink-0 w-14 h-8 rounded-full bg-ink-300 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/40 focus-visible:ring-offset-2'
          }
        >
          <span
            className={
              ouvertes
                ? 'absolute top-1 left-7 w-6 h-6 rounded-full bg-white shadow-md transition-all'
                : 'absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow-md transition-all'
            }
            aria-hidden
          />
        </button>
      </div>
    </Card>
  )
}
