/**
 * RT-SC · Per-élève paiement modal.
 *
 * Opens from FinancesAdminTab search. Shows:
 *   - Élève identity header
 *   - Running balance card: total versé vs cible, reste à payer, état
 *   - Add-tranche composer (inline, expands into the modal)
 *   - Paiement history list with per-row: download receipt / delete
 *
 * Rules of thumb:
 *   - `caissier` auto-filled from the current admin's displayName / email
 *     (never left to admin to type)
 *   - Default montant = reste à payer (if positive)
 *   - Receipt button = generates the PDF immediately (no round-trip)
 */

import { useState } from 'react'
import {
  CheckCircle2,
  CreditCard,
  FileText,
  Plus,
  Receipt,
  Trash2,
  User,
} from 'lucide-react'
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/cn'
import {
  useElevePaiements,
  useAddPaiement,
  useDeletePaiement,
  totalPaiements,
  tsToDate,
  formatFCFA,
} from '@/hooks/usePaiements'
import { useFinancesConfig, calculerCible, getEtatPaiement } from '@/hooks/useFinances'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useCaissier, resolveCaissierName } from '@/stores/caissier'
import { exportReceiptPDF } from '@/lib/receipt-export'
import { serverNow } from '@/lib/serverTime'
import type { EleveWithClasse } from '@/hooks/useAllEleves'
import type { Paiement } from '@/types/models'

interface Props {
  open: boolean
  eleve: EleveWithClasse | null
  classeName: string
  niveau: string | undefined
  onClose: () => void
}

// Methode is freeform — admin types whatever they want (espèces, MoMo, etc.)

export function ModalElevePaiements({
  open,
  eleve,
  classeName,
  niveau,
  onClose,
}: Props) {
  const { data: paiements = [], isLoading } = useElevePaiements(
    eleve?.classeId,
    eleve?.id
  )
  const { data: cfg } = useFinancesConfig()
  const { data: ecole } = useEcoleConfig()

  const addMut = useAddPaiement()
  const delMut = useDeletePaiement()
  const toast = useToast()
  const confirm = useConfirm()
  const authUser = useAuthStore((s) => s.user)
  const authProfil = useAuthStore((s) => s.profil)
  // Caissier display-name override (empty string for admin users).
  const caissierOverride = useCaissier((s) => s.displayName)

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false)

  const cible = cfg && eleve ? calculerCible(eleve.genre, niveau, cfg) : 0
  const paye = totalPaiements(paiements)
  const reste = Math.max(0, cible - paye)
  const pct = cible > 0 ? Math.min(100, Math.round((paye / cible) * 100)) : 0

  // Three precise states: 'aucun' | 'partiel' | 'solde' (or 'neant' if no
  // cible configured). Centralized in useFinances so terminology stays
  // synced with bilan + class trier + future surfaces.
  const etatInfo = cible === 0
    ? { etat: 'neant' as const, label: 'Aucune cible configurée', variant: 'neutral' as const }
    : getEtatPaiement(paye, cible)

  async function handleDelete(p: Paiement) {
    if (!eleve) return
    const ok = await confirm({
      title: 'Supprimer ce paiement ?',
      message: `Le versement de ${formatFCFA(p.montant)} enregistré le ${
        tsToDate(p.date)?.toLocaleDateString('fr-FR') ?? '?'
      } sera définitivement retiré du dossier.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await delMut.mutateAsync({
        classeId: eleve.classeId,
        eleveId: eleve.id,
        paiementId: p.id,
      })
      toast.success('Paiement supprimé.')
    } catch (err) {
      console.error('[delete paiement] error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  function handleReceipt(p: Paiement) {
    if (!eleve) return
    const date = tsToDate(p.date) ?? serverNow()
    try {
      exportReceiptPDF({
        ecoleNom: ecole?.nom,
        ecoleAdresse: ecole?.adresse,
        ecoleTelephone: ecole?.telephone,
        eleveNom: eleve.nom ?? 'Sans nom',
        matricule: eleve.matricule,
        classeNom: classeName,
        anneeScolaire: ecole?.anneeActive ?? '',
        montant: p.montant,
        methode: p.methode,
        note: p.note,
        date,
        caissier: p.caissier,
        receiptNumber: p.id.slice(-8).toUpperCase(),
      })
      toast.success('Reçu PDF généré.')
    } catch (err) {
      console.error('[receipt] error:', err)
      toast.error('Échec de la génération du reçu.')
    }
  }

  async function handleAdd(input: {
    montant: number
    methode: string
    note: string
  }) {
    if (!eleve) return
    const caissier = resolveCaissierName({
      override: caissierOverride,
      profilNom: authProfil?.nom,
      authDisplayName: authUser?.displayName,
      authEmail: authUser?.email,
    })
    try {
      await addMut.mutateAsync({
        classeId: eleve.classeId,
        eleveId: eleve.id,
        montant: input.montant,
        caissier,
        methode: input.methode || undefined,
        note: input.note || undefined,
      })
      toast.success(`Tranche de ${formatFCFA(input.montant)} enregistrée.`)
      setComposeOpen(false)
    } catch (err) {
      console.error('[add paiement] error:', err)
      toast.error('Échec de l’enregistrement.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <ModalHeader>
        <ModalTitle>
          {eleve?.nom ?? 'Élève'}
        </ModalTitle>
        <ModalDescription>
          {classeName}
          {eleve?.matricule && (
            <> · Matricule <span className="font-mono">{eleve.matricule}</span></>
          )}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {/* Balance card */}
        <BalanceCard
          cible={cible}
          paye={paye}
          reste={reste}
          pct={pct}
          etatLabel={etatInfo.label}
          etatVariant={etatInfo.variant}
        />

        {/* Add tranche — inline composer, expands */}
        {!composeOpen ? (
          <div className="mt-4">
            <Button
              onClick={() => setComposeOpen(true)}
              leadingIcon={<Plus className="h-4 w-4" />}
              className="w-full"
            >
              Ajouter une tranche
            </Button>
          </div>
        ) : (
          <ComposerBlock
            defaultMontant={reste > 0 ? reste : cible}
            onSubmit={handleAdd}
            onCancel={() => setComposeOpen(false)}
            submitting={addMut.isPending}
          />
        )}

        {/* History */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400">
              Historique
            </p>
            {paiements.length > 0 && (
              <p className="text-[0.7rem] text-ink-500">
                {paiements.length} versement{paiements.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {isLoading && paiements.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : paiements.length === 0 ? (
            <div className="text-center py-6 text-ink-400 text-[0.82rem]">
              <CreditCard className="h-8 w-8 mx-auto mb-2 text-ink-300" aria-hidden />
              Aucun paiement enregistré.
            </div>
          ) : (
            <div className="space-y-1.5">
              {paiements.map((p) => (
                <PaiementRow
                  key={p.id}
                  p={p}
                  onReceipt={() => handleReceipt(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Balance card ─────────────────────────────────────────────

function BalanceCard({
  cible,
  paye,
  reste,
  pct,
  etatLabel,
  etatVariant,
}: {
  cible: number
  paye: number
  reste: number
  pct: number
  etatLabel: string
  etatVariant: 'success' | 'warning' | 'danger' | 'neutral'
}) {
  // Progress bar color picks up from the variant for visual consistency.
  const color =
    etatVariant === 'success'
      ? 'bg-success'
      : etatVariant === 'warning'
        ? 'bg-gold-dark'
        : etatVariant === 'danger'
          ? 'bg-danger'
          : 'bg-ink-300'

  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400">
            Balance
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-[1.4rem] font-bold text-navy font-mono">
              {formatFCFA(paye)}
            </span>
            <span className="text-ink-400 text-[0.82rem]">/ {formatFCFA(cible)}</span>
          </div>
        </div>
        <Badge variant={etatVariant} size="sm">
          {etatLabel}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', color)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[0.72rem] text-ink-500">
        <span>{pct}% versé</span>
        {reste > 0 && (
          <span>
            Reste : <span className="font-mono font-semibold text-ink-700">{formatFCFA(reste)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Composer ─────────────────────────────────────────────────

function ComposerBlock({
  defaultMontant,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultMontant: number
  onSubmit: (input: { montant: number; methode: string; note: string }) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [montantStr, setMontantStr] = useState(
    defaultMontant > 0 ? String(defaultMontant) : ''
  )
  const [methode, setMethode] = useState<string>('')
  const [note, setNote] = useState('')

  const montant = Number(montantStr) || 0
  const valid = montant > 0

  function submit() {
    if (!valid) return
    onSubmit({ montant, methode, note })
  }

  return (
    <div className="mt-4 rounded-lg border border-navy/20 bg-navy/5 p-4 space-y-3">
      <p className="font-display text-[0.9rem] font-bold text-navy">
        Nouveau versement
      </p>
      <div>
        <label className="block text-[0.78rem] font-semibold text-ink-700 mb-1">
          Montant (FCFA)
        </label>
        <Input
          type="number"
          inputMode="numeric"
          value={montantStr}
          onChange={(e) => setMontantStr(e.target.value)}
          placeholder="Ex. 15000"
          min={1}
          step={500}
          autoFocus
        />
      </div>
      <div>
        <label className="block text-[0.78rem] font-semibold text-ink-700 mb-1">
          Mode de paiement (facultatif)
        </label>
        <Input
          value={methode}
          onChange={(e) => setMethode(e.target.value)}
          placeholder="Ex. espèces"
          maxLength={30}
        />
      </div>
      <div>
        <label className="block text-[0.78rem] font-semibold text-ink-700 mb-1">
          Note (facultatif)
        </label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex. 1ère tranche, paiement différé, etc."
          maxLength={120}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Annuler
        </Button>
        <Button
          onClick={submit}
          disabled={!valid || submitting}
          loading={submitting}
          leadingIcon={<CheckCircle2 className="h-4 w-4" />}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  )
}

// ─── Paiement row ─────────────────────────────────────────────

function PaiementRow({
  p,
  onReceipt,
  onDelete,
}: {
  p: Paiement
  onReceipt: () => void
  onDelete: () => void
}) {
  const d = tsToDate(p.date)
  return (
    <article className="rounded-md border border-ink-100 bg-white p-3 shadow-sm flex items-center gap-3">
      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-success/10 text-success ring-1 ring-success/20">
        <Receipt className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-[0.92rem] text-navy">
            {formatFCFA(p.montant)}
          </span>
          {p.methode && (
            <Badge variant="neutral" size="sm">{p.methode}</Badge>
          )}
        </div>
        <div className="text-[0.7rem] text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{d ? d.toLocaleDateString('fr-FR') : '—'}</span>
          {p.caissier && (
            <>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" aria-hidden />
                {p.caissier}
              </span>
            </>
          )}
        </div>
        {p.note && (
          <p className="text-[0.72rem] text-ink-500 italic mt-0.5 truncate">
            {p.note}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <IconButton
          variant="ghost"
          aria-label="Imprimer le reçu"
          onClick={onReceipt}
        >
          <FileText className="h-4 w-4" />
        </IconButton>
        <IconButton
          variant="danger"
          aria-label="Supprimer ce paiement"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </article>
  )
}
