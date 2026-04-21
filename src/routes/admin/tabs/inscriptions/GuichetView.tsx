/**
 * RT-SC · Guichet d'admission view (caissier).
 *
 * Three-step flow:
 *   1. Type tracking code → search → load dossier preview
 *   2. See cible (calculated from gratuité config + classe assignée)
 *      + montant input. App enforces `montant >= cible` (full payment
 *      mandatory at inscription per legacy)
 *   3. "Valider & inscrire" → atomic flow:
 *      - Creates real élève
 *      - Records the paiement
 *      - Closes pre_inscription
 *      - Cleans up document subcollection
 *      - Shows credentials modal (codePin + passkeyParent for caissier
 *        to write on the receipt and hand to the parent)
 */

import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  ScanLine,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/Modal'
import { useToast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { useCaissier, resolveCaissierName } from '@/stores/caissier'
import { useClasses } from '@/hooks/useClasses'
import { useFinancesConfig, calculerCible } from '@/hooks/useFinances'
import {
  findInscriptionByTrackingCode,
  useFinalizeInscription,
  type FinalizeInscriptionResult,
} from '@/hooks/usePreInscriptions'
import { formatFCFA } from '@/hooks/usePaiements'
import { nomClasse } from '@/lib/benin'
import { exportReceiptPDF } from '@/lib/receipt-export'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import type { Classe, PreInscription } from '@/types/models'

export function GuichetView() {
  const { data: classes = [] } = useClasses()
  const { data: cfg } = useFinancesConfig()
  const { data: ecole } = useEcoleConfig()
  const finalizeMut = useFinalizeInscription()
  const toast = useToast()
  const authUser = useAuthStore((s) => s.user)
  const authProfil = useAuthStore((s) => s.profil)
  // Caissier display-name override (empty string = no override).
  const caissierOverride = useCaissier((s) => s.displayName)

  const [code, setCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [dossier, setDossier] = useState<PreInscription | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [montantStr, setMontantStr] = useState('')
  const [methode, setMethode] = useState('')
  const [credentials, setCredentials] =
    useState<FinalizeInscriptionResult | null>(null)
  const [credModalOpen, setCredModalOpen] = useState(false)
  const [finalizedDossier, setFinalizedDossier] = useState<PreInscription | null>(null)

  function findClasse(id: string | undefined): Classe | undefined {
    if (!id) return undefined
    return classes.find((c) => c.id === id)
  }

  const classe = dossier ? findClasse(dossier.classeCible) : undefined
  const cible = dossier && cfg ? calculerCible(dossier.genre, classe?.niveau, cfg) : 0

  const montant = Number(montantStr) || 0
  const valid = dossier && montant >= cible && cible > 0

  async function handleSearch() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      toast.error('Entrez un code de suivi.')
      return
    }
    setSearching(true)
    setSearchError(null)
    setDossier(null)
    setMontantStr('')
    setMethode('')
    try {
      const found = await findInscriptionByTrackingCode(trimmed)
      if (!found) {
        setSearchError('Aucun dossier ne correspond à ce code.')
        return
      }
      if (found.statut !== 'Approuvé') {
        const labels: Record<string, string> = {
          'En attente': 'en cours de traitement',
          Refusé: 'a été refusé',
          'Inscrit Officiellement': 'a déjà été finalisé',
        }
        const what = labels[found.statut] ?? `est en statut "${found.statut}"`
        setSearchError(`Ce dossier ${what}. Vous ne pouvez pas l'encaisser.`)
        return
      }
      setDossier(found)
      // Pre-fill montant with cible (it's mandatory anyway — saves a tap)
      setTimeout(() => {
        if (cfg) {
          const c = findClasse(found.classeCible)
          const cible = calculerCible(found.genre, c?.niveau, cfg)
          if (cible > 0) setMontantStr(String(cible))
        }
      }, 0)
    } catch (err) {
      console.error('[guichet search] error:', err)
      setSearchError(
        err instanceof Error ? err.message : 'Erreur de recherche.'
      )
    } finally {
      setSearching(false)
    }
  }

  // Snapshot taken AT finalize time so the receipt PDF (generated after
  // the user clicks "Imprimer" in the credentials modal) doesn't read
  // from state variables that may have been reset by the "next visitor"
  // cleanup below. Without this, receipt would print 0F.
  const [finalizedSnapshot, setFinalizedSnapshot] = useState<{
    montant: number
    methode: string
    caissier: string
    date: Date
  } | null>(null)

  async function handleFinalize() {
    if (!dossier || !valid) return
    const caissier = resolveCaissierName({
      override: caissierOverride,
      profilNom: authProfil?.nom,
      authDisplayName: authUser?.displayName,
      authEmail: authUser?.email,
    })

    try {
      const res = await finalizeMut.mutateAsync({
        inscription: dossier,
        montant,
        caissier,
        methode: methode.trim() || undefined,
      })
      // Capture dossier + paiement snapshot BEFORE clearing state so the
      // credentials modal + receipt print can reference them safely.
      setFinalizedDossier(dossier)
      setFinalizedSnapshot({
        montant,
        methode: methode.trim(),
        caissier,
        date: new Date(),
      })
      setCredentials(res)
      setCredModalOpen(true)
      toast.success(`${dossier.nom} inscrit officiellement.`)
      // Reset for next visitor
      setDossier(null)
      setCode('')
      setMontantStr('')
      setMethode('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[finalize] error:', err)
      toast.error(msg)
    }
  }

  function handlePrintReceipt() {
    if (!credentials || !finalizedDossier || !finalizedSnapshot) return
    const classeNow = findClasse(finalizedDossier.classeCible)
    try {
      exportReceiptPDF({
        ecoleNom: ecole?.nom,
        ecoleAdresse: ecole?.adresse,
        ecoleTelephone: ecole?.telephone,
        eleveNom: finalizedDossier.nom,
        classeNom: classeNow ? nomClasse(classeNow) : '—',
        anneeScolaire: ecole?.anneeActive ?? '',
        montant: finalizedSnapshot.montant,
        methode: finalizedSnapshot.methode || undefined,
        date: finalizedSnapshot.date,
        caissier: finalizedSnapshot.caissier,
        receiptNumber: credentials.paiementId.slice(-8).toUpperCase(),
      })
      toast.success('Reçu PDF généré.')
    } catch (err) {
      console.error('[print receipt] error:', err)
      toast.error('Échec de la génération du reçu.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ScanLine className="h-5 w-5 text-navy" aria-hidden />
          <h3 className="font-display font-bold text-[1rem] text-navy">
            Recherche par code de suivi
          </h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="SC-XXXXXX"
            leading={<Search className="h-4 w-4 text-ink-400" />}
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase tracking-wider"
          />
          <Button
            onClick={handleSearch}
            disabled={!code.trim() || searching}
            loading={searching}
          >
            Chercher
          </Button>
        </div>
        {searchError && (
          <div className="mt-3 rounded-md bg-danger-bg border border-danger/30 p-3 text-[0.82rem] text-danger flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* Dossier preview + payment composer */}
      {dossier && (
        <div className="rounded-lg border border-success/30 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success-dark ring-1 ring-success/20">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-display font-bold text-[1.05rem] text-navy">
                {dossier.nom}
              </h4>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-[0.78rem] text-ink-600">
                <Badge variant={dossier.genre === 'F' ? 'serie-a' : 'navy'} size="sm">
                  {dossier.genre}
                </Badge>
                <span>{dossier.niveauSouhaite}</span>
                <span className="text-ink-300">·</span>
                <span>
                  Classe assignée :{' '}
                  <strong>{classe ? nomClasse(classe) : '—'}</strong>
                </span>
              </div>
              <div className="mt-1 text-[0.72rem] text-ink-500 flex items-center gap-2 flex-wrap">
                <span>RV : {dossier.dateRV ?? '—'}</span>
                <span className="text-ink-300">·</span>
                <span>
                  Tél : <span className="font-mono">{dossier.contactParent}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Cible callout */}
          <div className="rounded-md bg-info-bg/60 border border-info/20 p-3 mb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[0.82rem] font-semibold text-navy">
                Montant total exigé
              </span>
              <span className="font-mono text-[1.1rem] font-bold text-navy">
                {formatFCFA(cible)}
              </span>
            </div>
            <p className="text-[0.7rem] text-ink-600 mt-1">
              Scolarité + frais annexes (gratuité filles appliquée si
              applicable). Montant total exigé en une seule tranche.
            </p>
          </div>

          {/* Payment input */}
          <div className="space-y-3">
            <div>
              <label className="block text-[0.82rem] font-semibold text-ink-700 mb-1">
                Montant encaissé (FCFA)
              </label>
              <Input
                type="number"
                inputMode="numeric"
                value={montantStr}
                onChange={(e) => setMontantStr(e.target.value)}
                min={cible}
                step={500}
                className={
                  montantStr && montant < cible
                    ? 'ring-2 ring-danger/40 border-danger/40'
                    : ''
                }
              />
              {montantStr && montant < cible && (
                <p className="text-[0.7rem] text-danger mt-1">
                  Le montant doit être au moins {formatFCFA(cible)}.
                </p>
              )}
            </div>
            <div>
              <label className="block text-[0.82rem] font-semibold text-ink-700 mb-1">
                Mode de paiement (facultatif)
              </label>
              <Input
                value={methode}
                onChange={(e) => setMethode(e.target.value)}
                placeholder="Ex : espèces"
                maxLength={30}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => {
                setDossier(null)
                setCode('')
                setMontantStr('')
                setMethode('')
              }}
              disabled={finalizeMut.isPending}
            >
              Annuler
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={!valid || finalizeMut.isPending}
              loading={finalizeMut.isPending}
              leadingIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Valider & inscrire
            </Button>
          </div>
        </div>
      )}

      {/* Credentials modal — shown after successful finalize */}
      <CredentialsModal
        open={credModalOpen}
        onClose={() => setCredModalOpen(false)}
        credentials={credentials}
        eleveNom={finalizedDossier?.nom ?? ''}
        onPrintReceipt={handlePrintReceipt}
      />
    </div>
  )
}

// ─── Credentials modal ───────────────────────────────────────

function CredentialsModal({
  open,
  onClose,
  credentials,
  eleveNom,
  onPrintReceipt,
}: {
  open: boolean
  onClose: () => void
  credentials: FinalizeInscriptionResult | null
  eleveNom: string
  onPrintReceipt: () => void
}) {
  const toast = useToast()

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copié.`)
    } catch {
      toast.error('Copie impossible.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>Inscription finalisée</ModalTitle>
        <ModalDescription>
          {eleveNom} est officiellement inscrit. Notez ces identifiants pour le parent.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {credentials && (
          <div className="space-y-3">
            <div className="rounded-md bg-info-bg/60 border border-info/20 p-3 flex items-start gap-2">
              <KeyRound className="h-4 w-4 text-info shrink-0 mt-0.5" aria-hidden />
              <p className="text-[0.78rem] text-navy leading-snug">
                Le code PIN sert à l'élève pour se connecter. Le passkey parent
                permet à un proche d'accéder au tableau de bord pour suivre la
                scolarité.
              </p>
            </div>

            <CredentialRow
              label="Code PIN élève"
              value={credentials.codePin}
              onCopy={() => copy(credentials.codePin, 'Code PIN')}
            />
            <CredentialRow
              label="Passkey parent"
              value={credentials.passkeyParent}
              onCopy={() =>
                copy(credentials.passkeyParent, 'Passkey parent')
              }
            />
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
        <Button onClick={onPrintReceipt}>Imprimer le reçu</Button>
      </ModalFooter>
    </Modal>
  )
}

function CredentialRow({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: () => void
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-white p-3">
      <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-1">
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <code className="font-mono text-[1.05rem] font-bold text-navy tracking-wider">
          {value}
        </code>
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Copy className="h-3.5 w-3.5" />}
          onClick={onCopy}
        >
          Copier
        </Button>
      </div>
    </div>
  )
}
