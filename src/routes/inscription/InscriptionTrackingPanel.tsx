/**
 * RT-SC · Public tracking lookup panel.
 *
 * Parent enters their tracking code → sees current dossier state:
 *
 *   - En attente      → soft waiting message
 *   - Approuvé        → date RV prominent + Reprogrammer button (cap 3)
 *   - Refusé          → reason displayed
 *   - Inscrit Off.    → welcome banner
 *
 * Reprogram flow uses the SAME `useReprogrammerRV` mutation admins use,
 * which atomically decrements the old day's counter and claims a new slot.
 * Capped at REPROG_MAX=3 — after which parent must call the school.
 *
 * No auth: rules allow `read: if true` on pre_inscriptions (the tracking
 * code is the de-facto auth — 6-char random string is hard to guess).
 */

import { useState } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  RotateCw,
  Search,
  XCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useSettingsInscription } from '@/hooks/useSettingsInscription'
import {
  findInscriptionByTrackingCode,
  useReprogrammerRV,
} from '@/hooks/usePreInscriptions'
import {
  DEFAULT_PLACES_PAR_JOUR,
  REPROG_MAX,
} from '@/lib/inscription-rdv'
import type { PreInscription } from '@/types/models'

export function InscriptionTrackingPanel() {
  const [code, setCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [dossier, setDossier] = useState<PreInscription | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  async function search() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setSearchError('Veuillez entrer votre code de suivi.')
      return
    }
    setSearching(true)
    setSearchError(null)
    setDossier(null)
    try {
      const found = await findInscriptionByTrackingCode(trimmed)
      if (!found) {
        setSearchError('Aucun dossier ne correspond à ce code. Vérifiez et réessayez.')
        return
      }
      setDossier(found)
    } catch (err) {
      console.error('[tracking search] error:', err)
      setSearchError('Erreur de connexion. Vérifiez votre internet et réessayez.')
    } finally {
      setSearching(false)
    }
  }

  // Allow refreshing the dossier after a reprogram (lookup again in-place)
  async function refresh() {
    if (!dossier) return
    try {
      const fresh = await findInscriptionByTrackingCode(dossier.trackingCode)
      if (fresh) setDossier(fresh)
    } catch (err) {
      console.error('[tracking refresh] error:', err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="rounded-lg bg-white border border-ink-100 shadow-sm p-4">
        <p className="text-[0.82rem] font-semibold text-navy mb-2">
          Entrez votre code de suivi
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search()
            }}
            placeholder="SC-XXXXXX"
            autoComplete="off"
            spellCheck={false}
            leading={<Search className="h-4 w-4 text-ink-400" />}
            className="font-mono uppercase tracking-wider"
            maxLength={12}
          />
          <Button
            onClick={search}
            disabled={!code.trim() || searching}
            loading={searching}
          >
            Chercher
          </Button>
        </div>
        <p className="text-[0.7rem] text-ink-500 mt-2">
          Ce code vous a été remis lors de la soumission de votre dossier.
        </p>
      </div>

      {/* Error */}
      {searchError && (
        <div className="rounded-lg bg-danger-bg border border-danger/30 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden />
          <p className="text-[0.82rem] text-danger leading-snug">{searchError}</p>
        </div>
      )}

      {/* Dossier display */}
      {dossier && (
        <DossierCard dossier={dossier} onRefresh={refresh} />
      )}
    </div>
  )
}

// ─── Dossier state card ──────────────────────────────────────

function DossierCard({
  dossier,
  onRefresh,
}: {
  dossier: PreInscription
  onRefresh: () => void | Promise<void>
}) {
  const { data: settings } = useSettingsInscription()
  const placesParJour =
    settings?.rendezVousPlacesParJour ?? DEFAULT_PLACES_PAR_JOUR
  const reprogMut = useReprogrammerRV()

  const [localError, setLocalError] = useState<string | null>(null)
  const [justReprogrammed, setJustReprogrammed] = useState<string | null>(null)

  const reprogCount = dossier.reprogCount ?? 0
  const reprogsLeft = Math.max(0, REPROG_MAX - reprogCount)

  async function handleReprogrammer() {
    if (!dossier.dateRV) return
    if (reprogCount >= REPROG_MAX) {
      setLocalError(
        `Vous avez atteint la limite de ${REPROG_MAX} reprogrammations. Veuillez contacter l'école directement.`
      )
      return
    }
    setLocalError(null)
    try {
      const res = await reprogMut.mutateAsync({
        inscriptionId: dossier.id,
        currentDateRV: dossier.dateRV,
        currentReprogCount: reprogCount,
        placesParJour,
      })
      setJustReprogrammed(res.dateRV)
      await onRefresh()
    } catch (err) {
      console.error('[public reprogrammer] error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setLocalError(msg)
    }
  }

  return (
    <article className="rounded-lg bg-white border border-ink-100 shadow-sm overflow-hidden">
      {/* Header: élève + statut badge */}
      <div className="p-4 border-b border-ink-100 bg-ink-50/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[0.7rem] uppercase font-bold tracking-widest text-ink-500">
              Dossier
            </p>
            <h3 className="font-display text-[1.1rem] font-bold text-navy truncate">
              {dossier.nom}
            </h3>
            <p className="text-[0.72rem] text-ink-500 mt-0.5">
              <span className="font-mono">{dossier.trackingCode}</span>
              {' · '}
              {dossier.niveauSouhaite}
            </p>
          </div>
          <StatutBadge statut={dossier.statut} />
        </div>
      </div>

      {/* Body — content varies by statut */}
      <div className="p-4">
        {dossier.statut === 'En attente' && <EnAttenteBody />}
        {dossier.statut === 'Approuvé' && (
          <ApprouveBody
            dateRV={dossier.dateRV ?? '—'}
            reprogsLeft={reprogsLeft}
            reprogCount={reprogCount}
            onReprogrammer={handleReprogrammer}
            isReprogramming={reprogMut.isPending}
            justReprogrammed={justReprogrammed}
            localError={localError}
          />
        )}
        {dossier.statut === 'Refusé' && (
          <RefuseBody raison={dossier.raisonRefus} />
        )}
        {dossier.statut === 'Inscrit Officiellement' && <InscritBody />}
      </div>
    </article>
  )
}

// ─── Statut badge ─────────────────────────────────────────────

function StatutBadge({ statut }: { statut: PreInscription['statut'] }) {
  const config = {
    'En attente': { variant: 'warning' as const, icon: Clock, label: 'En attente' },
    'Approuvé': { variant: 'success' as const, icon: CheckCircle2, label: 'Approuvé' },
    'Refusé': { variant: 'danger' as const, icon: XCircle, label: 'Refusé' },
    'Inscrit Officiellement': {
      variant: 'success' as const,
      icon: GraduationCap,
      label: 'Inscrit',
    },
  }[statut]

  if (!config) return null
  const Icon = config.icon

  return (
    <Badge variant={config.variant} size="md">
      <Icon className="h-3.5 w-3.5 mr-1 inline" />
      {config.label}
    </Badge>
  )
}

// ─── Body per statut ──────────────────────────────────────────

function EnAttenteBody() {
  return (
    <div className="space-y-3 text-center py-3">
      <Clock className="h-10 w-10 text-warning mx-auto" aria-hidden />
      <p className="font-semibold text-navy">Votre dossier est en cours de traitement.</p>
      <p className="text-[0.82rem] text-ink-600 leading-snug">
        L'administration va bientôt l'examiner. Revenez avec votre code
        dans quelques jours pour voir l'avancement.
      </p>
    </div>
  )
}

function ApprouveBody({
  dateRV,
  reprogsLeft,
  reprogCount,
  onReprogrammer,
  isReprogramming,
  justReprogrammed,
  localError,
}: {
  dateRV: string
  reprogsLeft: number
  reprogCount: number
  onReprogrammer: () => void
  isReprogramming: boolean
  justReprogrammed: string | null
  localError: string | null
}) {
  return (
    <div className="space-y-4">
      <div className="text-center py-3">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" aria-hidden />
        <p className="font-semibold text-navy mb-1">
          Dossier approuvé !
        </p>
        <p className="text-[0.82rem] text-ink-600">
          Vous avez un rendez-vous physique à l'école.
        </p>
      </div>

      <div className="rounded-lg bg-success/8 border-2 border-success/30 p-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Calendar className="h-4 w-4 text-success-dark" aria-hidden />
          <p className="text-[0.7rem] uppercase font-bold tracking-widest text-success-dark">
            Date de rendez-vous
          </p>
        </div>
        <p className="font-mono text-[1.6rem] font-bold text-navy mt-1">
          {dateRV}
        </p>
        {justReprogrammed && (
          <p className="text-[0.75rem] text-success-dark mt-1 font-semibold">
            ✓ Date mise à jour
          </p>
        )}
      </div>

      {localError && (
        <div className="rounded-lg bg-danger-bg border border-danger/30 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden />
          <p className="text-[0.82rem] text-danger leading-snug">{localError}</p>
        </div>
      )}

      <div className="space-y-2 pt-2">
        <p className="text-[0.78rem] font-semibold text-ink-700">
          Cette date ne vous convient pas ?
        </p>
        <Button
          onClick={onReprogrammer}
          disabled={reprogsLeft === 0 || isReprogramming}
          loading={isReprogramming}
          variant="secondary"
          leadingIcon={<RotateCw className="h-4 w-4" />}
          className="w-full"
        >
          Reprogrammer mon rendez-vous
        </Button>
        <p className="text-[0.7rem] text-ink-500 text-center">
          {reprogsLeft > 0
            ? `${reprogsLeft} reprogrammation${reprogsLeft > 1 ? 's' : ''} restante${reprogsLeft > 1 ? 's' : ''} (${reprogCount}/${REPROG_MAX} utilisée${reprogCount > 1 ? 's' : ''})`
            : `Limite de ${REPROG_MAX} reprogrammations atteinte. Contactez l'école.`}
        </p>
      </div>

      <div className="rounded-md bg-ink-50/40 border border-ink-100 p-3 text-[0.78rem] text-ink-700 leading-snug">
        <p className="font-semibold text-navy mb-1">Le jour du rendez-vous :</p>
        <ul className="list-disc list-inside space-y-0.5 text-[0.76rem]">
          <li>Présentez-vous à l'administration de l'école</li>
          <li>Apportez votre code de suivi</li>
          <li>Apportez les pièces originales et le paiement</li>
        </ul>
      </div>
    </div>
  )
}

function RefuseBody({ raison }: { raison?: string }) {
  return (
    <div className="space-y-3">
      <div className="text-center py-3">
        <XCircle className="h-10 w-10 text-danger mx-auto mb-2" aria-hidden />
        <p className="font-semibold text-navy">Dossier refusé</p>
      </div>
      {raison && (
        <div className="rounded-md bg-danger-bg border-l-4 border-danger p-3">
          <p className="text-[0.7rem] uppercase font-bold tracking-widest text-danger mb-1">
            Motif
          </p>
          <p className="text-[0.85rem] text-ink-800 leading-snug">
            {raison}
          </p>
        </div>
      )}
      <p className="text-[0.78rem] text-ink-600 leading-snug text-center">
        Pour plus d'informations ou pour soumettre un nouveau dossier,
        contactez l'administration de l'école.
      </p>
    </div>
  )
}

function InscritBody() {
  return (
    <div className="space-y-3 text-center py-4">
      <GraduationCap className="h-12 w-12 text-success mx-auto" aria-hidden />
      <h4 className="font-display text-[1.15rem] font-bold text-navy">
        Bienvenue !
      </h4>
      <p className="text-[0.82rem] text-ink-600 leading-snug">
        L'élève est officiellement inscrit. L'administration vous a remis
        un code PIN et un passkey parent permettant de vous connecter à
        votre espace personnel.
      </p>
      <div className="rounded-md bg-success/8 border border-success/30 p-3 text-[0.75rem] text-ink-700 leading-snug">
        Rendez-vous à l'adresse de connexion de l'école avec ces identifiants
        pour suivre le parcours de votre enfant.
      </div>
    </div>
  )
}
