/**
 * Vendor · Screen 4 — Command Center.
 *
 * The actual management surface for the connected school. Everything
 * here writes to `ecole/subscription` in the active school's
 * Firestore. Split into sections for clarity:
 *
 *   0. Status banner — deadline, lock state, unlock-request alert
 *   1. FedaPay config — public key
 *   2. Subscription config — price + duration
 *   3. Support — WhatsApp number
 *   4. Actions — record payment, reset cycle, clear alert
 *   5. Manual lock toggle (danger zone)
 */

import { useEffect, useState } from 'react'
import {
  Calendar,
  CreditCard,
  Banknote,
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  Bell,
  Lock,
  Unlock,
  RotateCw,
  Save,
  ShieldOff,
  Eraser,
} from 'lucide-react'
import { useSession } from '@/lib/session'
import {
  useSubscription,
  saveConfig,
  recordPayment,
  resetCycle,
  clearUnlockAlert,
  toggleManualLock,
} from '@/lib/subscription'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { SectionCard } from '@/ui/SectionCard'
import { cn } from '@/lib/cn'

export function CommandCenter() {
  const { phase } = useSession()

  // Phase guard (the router ensures phase === 'active' when this
  // renders, but we narrow defensively).
  if (phase.kind !== 'active') return null
  const { firebase, school } = phase

  return (
    <CommandCenterInner
      db={firebase.db}
      projectId={firebase.projectId}
      schoolName={school.name}
    />
  )
}

function CommandCenterInner({
  db,
  projectId,
  schoolName,
}: {
  db: import('firebase/firestore').Firestore
  projectId: string
  schoolName: string
}) {
  const sub = useSubscription(db)

  // ───── Config form state ─────
  // Kept in local state so the vendor can edit without each keystroke
  // triggering a Firestore write. Syncs from raw doc on arrival and on
  // raw changes that aren't mid-edit (we use per-field "edited" flags
  // to avoid wiping out typing).
  const [fedaKey, setFedaKey] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  // Per-field "dirty" flags — if the field has been edited locally, we
  // don't overwrite it from incoming snapshots. Cleared on successful
  // save.
  const [dirty, setDirty] = useState({
    fedaKey: false,
    price: false,
    duration: false,
    whatsapp: false,
  })

  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saved' | 'error'
  >('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Hydrate form from doc when snapshot arrives AND field isn't dirty
  useEffect(() => {
    if (!sub.raw) return
    if (!dirty.fedaKey) setFedaKey(sub.raw.fedaPayPublicKey ?? '')
    if (!dirty.price)
      setPrice(
        sub.raw.subscriptionPrice !== undefined
          ? String(sub.raw.subscriptionPrice)
          : ''
      )
    if (!dirty.duration)
      setDuration(
        sub.raw.subscriptionDurationMonths !== undefined
          ? String(sub.raw.subscriptionDurationMonths)
          : ''
      )
    if (!dirty.whatsapp) setWhatsapp(sub.raw.supportWhatsAppNumber ?? '')
  }, [sub.raw, dirty.fedaKey, dirty.price, dirty.duration, dirty.whatsapp])

  // ───── Save config handler ─────
  async function handleSave() {
    setSaveError(null)

    const priceNum = parseInt(price, 10)
    const durationNum = parseInt(duration, 10)

    // Validation
    if (!fedaKey.trim()) {
      setSaveError('La clé FedaPay est requise.')
      return
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setSaveError('Le prix doit être un entier positif.')
      return
    }
    if (!Number.isFinite(durationNum) || durationNum < 1) {
      setSaveError('La durée doit être d\'au moins 1 mois.')
      return
    }

    // Strip non-digits from WhatsApp number
    const waTrimmed = whatsapp.trim()
    const waDigits = waTrimmed ? waTrimmed.replace(/\D/g, '') : ''

    setSaving(true)
    try {
      await saveConfig(db, {
        fedaPayPublicKey: fedaKey.trim(),
        subscriptionPrice: priceNum,
        subscriptionDurationMonths: durationNum,
        // Only send if non-empty — avoids accidentally wiping
        supportWhatsAppNumber: waDigits || undefined,
      })
      setSaveStatus('saved')
      setDirty({
        fedaKey: false,
        price: false,
        duration: false,
        whatsapp: false,
      })
      // Auto-clear success state
      setTimeout(() => setSaveStatus('idle'), 2200)
    } catch (err) {
      console.error('[CommandCenter] saveConfig failed:', err)
      setSaveStatus('error')
      setSaveError(
        'Erreur lors de la sauvegarde. Vérifiez vos droits Firestore.'
      )
    } finally {
      setSaving(false)
    }
  }

  // ───── Action handlers ─────
  const [actionPending, setActionPending] = useState<string | null>(null)

  async function handleRecordPayment() {
    const durationNum =
      parseInt(duration, 10) ||
      sub.raw?.subscriptionDurationMonths ||
      1
    const confirmMsg = `Confirmer le paiement de ${schoolName} et ajouter ${durationNum} mois ?`
    if (!confirm(confirmMsg)) return
    setActionPending('pay')
    try {
      const newDeadline = await recordPayment(db, sub.deadline, durationNum)
      alert(
        `Paiement enregistré. Nouvelle échéance : ${formatDate(newDeadline)}.`
      )
    } catch (err) {
      console.error('[CommandCenter] recordPayment failed:', err)
      alert('Erreur. Réessayez.')
    } finally {
      setActionPending(null)
    }
  }

  async function handleResetCycle() {
    const durationNum =
      parseInt(duration, 10) ||
      sub.raw?.subscriptionDurationMonths ||
      1
    if (
      !confirm(
        `Redémarrer le cycle à aujourd'hui + ${durationNum} mois pour ${schoolName} ?`
      )
    )
      return
    setActionPending('reset')
    try {
      const newDeadline = await resetCycle(db, durationNum)
      alert(`Cycle redémarré. Échéance : ${formatDate(newDeadline)}.`)
    } catch (err) {
      console.error('[CommandCenter] resetCycle failed:', err)
      alert('Erreur. Réessayez.')
    } finally {
      setActionPending(null)
    }
  }

  async function handleClearAlert() {
    if (!confirm(`Effacer l'alerte de paiement externe pour ${schoolName} ?`))
      return
    setActionPending('clearAlert')
    try {
      await clearUnlockAlert(db)
    } catch (err) {
      console.error('[CommandCenter] clearUnlockAlert failed:', err)
      alert('Erreur. Réessayez.')
    } finally {
      setActionPending(null)
    }
  }

  async function handleToggleLock() {
    const nextLocked = !sub.isManualLock
    const msg = nextLocked
      ? `Verrouiller manuellement ${schoolName} ? L'admin sera immédiatement redirigé vers la page de renouvellement.`
      : `Déverrouiller manuellement ${schoolName} ?`
    if (!confirm(msg)) return
    setActionPending('toggleLock')
    try {
      await toggleManualLock(db, sub.isManualLock)
    } catch (err) {
      console.error('[CommandCenter] toggleManualLock failed:', err)
      alert('Erreur. Réessayez.')
    } finally {
      setActionPending(null)
    }
  }

  // ───── Loading state ─────
  if (sub.loading) {
    return (
      <div className="py-12 text-center">
        <RotateCw className="h-6 w-6 text-navy animate-spin mx-auto" aria-hidden />
        <p className="text-[0.85rem] text-ink-500 mt-3">
          Chargement de l'abonnement…
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Unlock-request alert banner — only when admin has signaled a
          cash/bank payment that needs manual verification */}
      {sub.hasRequestedUnlock && (
        <div className="rounded-xl bg-warning-bg/70 border-[1.5px] border-warning/40 px-4 py-3.5 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-warning/15 border border-warning/40 shrink-0">
            <Bell className="h-4 w-4 text-warning-dark" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[0.95rem] font-bold text-warning-dark leading-tight">
              Alerte : paiement externe signalé
            </p>
            <p className="text-[0.82rem] text-ink-700 mt-1 leading-snug">
              L'administrateur de {schoolName} dit avoir payé par un moyen
              hors ligne. Vérifiez puis enregistrez le paiement (ajouter
              la durée), ou effacez l'alerte si c'est une erreur.
            </p>
          </div>
        </div>
      )}

      {/* Status card */}
      <SectionCard
        title="État de l'abonnement"
        description={
          sub.uninitialized
            ? 'Document non initialisé — sauvegardez la configuration pour créer.'
            : undefined
        }
        icon={<Calendar />}
        tone={
          sub.uninitialized
            ? 'warning'
            : sub.isManualLock
              ? 'danger'
              : 'default'
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[0.7rem] uppercase tracking-widest font-bold text-ink-400">
              Deadline
            </p>
            {sub.deadline ? (
              <p className="font-display text-[1.1rem] font-bold text-navy mt-0.5 leading-tight">
                {formatDate(sub.deadline)}
              </p>
            ) : (
              <p className="text-[0.9rem] text-ink-400 mt-0.5 italic">
                Non définie
              </p>
            )}
            {sub.deadline && (
              <p className="text-[0.7rem] text-ink-400 mt-0.5">
                {formatRelative(sub.deadline)}
              </p>
            )}
          </div>
          <div>
            <p className="text-[0.7rem] uppercase tracking-widest font-bold text-ink-400">
              Accès
            </p>
            <div className="mt-0.5">
              {sub.isManualLock ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-danger-bg text-danger border border-danger/30 px-2 py-1 text-[0.78rem] font-bold">
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  Verrouillé
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-success-bg text-success-dark border border-success/30 px-2 py-1 text-[0.78rem] font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Actif
                </span>
              )}
            </div>
            <p className="text-[0.66rem] text-ink-400 mt-2 font-mono truncate">
              {projectId}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Configuration form — FedaPay + subscription + support */}
      <SectionCard
        title="FedaPay"
        description="Clé publique utilisée par la page de paiement de l'école."
        icon={<CreditCard />}
      >
        <Input
          label="Clé publique FedaPay"
          placeholder="pk_live_… ou pk_sandbox_…"
          value={fedaKey}
          onChange={(e) => {
            setFedaKey(e.target.value)
            setDirty((d) => ({ ...d, fedaKey: true }))
          }}
          className="font-mono text-[0.82rem]"
        />
      </SectionCard>

      <SectionCard
        title="Abonnement"
        description="Prix par cycle et durée ajoutée à chaque paiement FedaPay."
        icon={<Banknote />}
      >
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Prix (FCFA)"
            type="number"
            inputMode="numeric"
            placeholder="15000"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value)
              setDirty((d) => ({ ...d, price: true }))
            }}
            min={0}
          />
          <Input
            label="Durée (mois)"
            type="number"
            inputMode="numeric"
            placeholder="1"
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value)
              setDirty((d) => ({ ...d, duration: true }))
            }}
            min={1}
            max={24}
            hint="Mois ajoutés par paiement"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Support WhatsApp"
        description="Affiché sur la page de verrouillage des admins. Lien wa.me direct."
        icon={<MessageCircle />}
      >
        <Input
          label="Numéro WhatsApp (avec indicatif)"
          placeholder="22990123456"
          value={whatsapp}
          onChange={(e) => {
            setWhatsapp(e.target.value)
            setDirty((d) => ({ ...d, whatsapp: true }))
          }}
          leftIcon={<MessageCircle />}
          hint="Tout format accepté — les chiffres seront extraits automatiquement."
        />
      </SectionCard>

      {/* Save bar — sticky-ish bottom action for the config form */}
      <div
        className={cn(
          'rounded-xl border-[1.5px] px-4 py-3.5 flex items-center justify-between gap-3 transition-colors',
          saveStatus === 'saved'
            ? 'bg-success-bg/40 border-success/30'
            : saveStatus === 'error'
              ? 'bg-danger-bg/40 border-danger/30'
              : 'bg-white border-ink-100'
        )}
      >
        <div className="flex-1 min-w-0">
          {saveStatus === 'saved' && (
            <p className="text-[0.82rem] font-semibold text-success-dark flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Configuration enregistrée
            </p>
          )}
          {saveStatus === 'error' && saveError && (
            <p className="text-[0.82rem] text-danger-dark">{saveError}</p>
          )}
          {saveStatus === 'idle' && saveError && (
            <p className="text-[0.82rem] text-danger-dark">{saveError}</p>
          )}
          {saveStatus === 'idle' && !saveError && (
            <p className="text-[0.82rem] text-ink-500">
              Modifications à enregistrer
            </p>
          )}
        </div>
        <Button
          variant="primary"
          icon={<Save />}
          loading={saving}
          onClick={handleSave}
        >
          Enregistrer
        </Button>
      </div>

      {/* Actions section — payment recording + cycle + alert */}
      <SectionCard
        title="Actions d'abonnement"
        description="Enregistrer un paiement, redémarrer le cycle, effacer les alertes."
        icon={<CheckCircle2 />}
        tone="success"
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="success"
            icon={<CheckCircle2 />}
            loading={actionPending === 'pay'}
            disabled={actionPending !== null}
            onClick={handleRecordPayment}
            fullWidth
          >
            Paiement reçu — ajouter la durée
          </Button>
          <Button
            variant="secondary"
            icon={<RotateCw />}
            loading={actionPending === 'reset'}
            disabled={actionPending !== null}
            onClick={handleResetCycle}
            fullWidth
          >
            Redémarrer le cycle à aujourd'hui
          </Button>
          {sub.hasRequestedUnlock && (
            <Button
              variant="secondary"
              icon={<Eraser />}
              loading={actionPending === 'clearAlert'}
              disabled={actionPending !== null}
              onClick={handleClearAlert}
              fullWidth
            >
              Effacer l'alerte (garder la date)
            </Button>
          )}
        </div>
        <p className="text-[0.72rem] text-ink-400 mt-3 leading-snug">
          La logique d'équité est appliquée : si l'échéance actuelle est
          dans le futur, la nouvelle durée s'ajoute à partir de
          l'échéance ; sinon elle démarre aujourd'hui.
        </p>
      </SectionCard>

      {/* Manual lock toggle */}
      <SectionCard
        title="Verrouillage manuel"
        description={
          sub.isManualLock
            ? 'L\'école est actuellement verrouillée par vous.'
            : 'Pour suspendre l\'accès immédiatement, quelle que soit l\'échéance.'
        }
        icon={sub.isManualLock ? <Unlock /> : <ShieldOff />}
        tone="danger"
      >
        <Button
          variant={sub.isManualLock ? 'secondary' : 'danger'}
          icon={sub.isManualLock ? <Unlock /> : <Lock />}
          loading={actionPending === 'toggleLock'}
          disabled={actionPending !== null}
          onClick={handleToggleLock}
          fullWidth
        >
          {sub.isManualLock
            ? 'Déverrouiller manuellement'
            : 'Verrouiller manuellement'}
        </Button>
      </SectionCard>

      {/* Uninitialized hint */}
      {sub.uninitialized && (
        <div className="rounded-md bg-info-bg border border-navy/15 px-4 py-3 flex items-start gap-2">
          <AlertTriangle
            className="h-4 w-4 text-navy shrink-0 mt-0.5"
            aria-hidden
          />
          <p className="text-[0.8rem] text-navy leading-snug">
            Cette école n'a pas encore de document{' '}
            <span className="font-mono">ecole/subscription</span>.
            Remplissez la configuration ci-dessus puis cliquez sur
            "Enregistrer" pour le créer.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatRelative(d: Date): string {
  const diffMs = d.getTime() - Date.now()
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays > 1) return `dans ${diffDays} jours`
  if (diffDays === 1) return 'demain'
  if (diffDays === 0) return "aujourd'hui"
  if (diffDays === -1) return 'hier'
  return `il y a ${Math.abs(diffDays)} jours`
}
