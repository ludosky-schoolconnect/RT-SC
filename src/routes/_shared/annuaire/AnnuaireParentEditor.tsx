/**
 * RT-SC · Annuaire — parent self-service editor.
 *
 * Lets a parent add/edit their public directory entry for one of
 * their children. Phone, profession, entreprise (optional) + name.
 * One form per (eleve × slot) pair.
 *
 * Opt-in: the parent must explicitly save to be listed. Nothing is
 * written without explicit consent. Editing always renews expiry
 * to +365 days.
 *
 * The save button is disabled until the three required fields have
 * valid content. Phone is normalized (digits only) on submission.
 */

import { useState } from 'react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/stores/toast'
import {
  useUpsertAnnuaireEntry,
  useDeleteAnnuaireEntry,
  isValidLocalTel,
  extractLocalTel,
  type ParentSlot,
  type AnnuaireParentEntry,
} from '@/hooks/useAnnuaire'
import { Briefcase, Info, Trash2 } from 'lucide-react'
import { useConfirm } from '@/stores/confirm'

interface Props {
  open: boolean
  onClose: () => void
  eleveId: string
  classeId: string
  eleveName: string
  slot: ParentSlot
  /** Existing entry (if editing) — pre-fills the form */
  existing?: AnnuaireParentEntry | null
}

export function AnnuaireParentEditor({
  open,
  onClose,
  eleveId,
  classeId,
  eleveName,
  slot,
  existing,
}: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const upsert = useUpsertAnnuaireEntry()
  const del = useDeleteAnnuaireEntry()

  const [nom, setNom] = useState(existing?.nom ?? '')
  const [profession, setProfession] = useState(existing?.profession ?? '')
  const [entreprise, setEntreprise] = useState(existing?.entreprise ?? '')
  // Only the local 10-digit portion is held in state; the +229 prefix
  // is rendered as a fixed, uneditable lead-in on the input. We store
  // the FULL number (with country code) via normalizeTel on save.
  const [localTel, setLocalTel] = useState(
    existing?.tel ? extractLocalTel(existing.tel) : ''
  )

  const canSave =
    nom.trim().length >= 2 &&
    profession.trim().length >= 2 &&
    isValidLocalTel(localTel)

  async function handleSave() {
    if (!canSave) return
    try {
      await upsert.mutateAsync({
        eleveId,
        classeId,
        slot,
        nom,
        profession,
        entreprise: entreprise.trim() || undefined,
        tel: localTel, // normalizeTel in the hook will prepend +229
      })
      toast.success(
        existing
          ? 'Profil mis à jour pour un an.'
          : "Vous êtes maintenant dans l'annuaire."
      )
      onClose()
    } catch (err) {
      console.error('[AnnuaireEditor] save failed:', err)
      toast.error(
        err instanceof Error
          ? err.message
          : "Impossible d'enregistrer le profil."
      )
    }
  }

  async function handleDelete() {
    if (!existing) return
    const ok = await confirm({
      title: 'Retirer votre profil ?',
      message:
        "Votre fiche sera supprimée de l'annuaire. Vous pourrez la recréer à tout moment.",
      confirmLabel: 'Retirer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await del.mutateAsync(existing.id)
      toast.success("Profil retiré de l'annuaire.")
      onClose()
    } catch (err) {
      console.error('[AnnuaireEditor] delete failed:', err)
      toast.error('Suppression impossible.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>
          <span className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-gold" aria-hidden />
            {existing ? "Modifier mon profil" : "Rejoindre l'annuaire"}
          </span>
        </ModalTitle>
        <ModalDescription>
          Partagez vos coordonnées professionnelles avec les autres
          parents de l'école. Enfant : <strong>{eleveName}</strong>.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3.5">
          <div>
            <label htmlFor="annuaire-nom" className="block text-[0.78rem] font-bold text-navy mb-1">Nom complet</label>
            <Input
              id="annuaire-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ADJOVI Louise"
              maxLength={60}
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="annuaire-profession" className="block text-[0.78rem] font-bold text-navy mb-1">Profession</label>
            <Input
              id="annuaire-profession"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              placeholder="Comptable, Médecin, Commerçante…"
              maxLength={60}
            />
          </div>

          <div>
            <label htmlFor="annuaire-entreprise" className="block text-[0.78rem] font-bold text-navy mb-1">
              Entreprise <span className="text-ink-400 font-normal">(facultatif)</span>
            </label>
            <Input
              id="annuaire-entreprise"
              value={entreprise}
              onChange={(e) => setEntreprise(e.target.value)}
              placeholder="Cabinet XYZ"
              maxLength={80}
            />
          </div>

          <div>
            <label htmlFor="annuaire-tel" className="block text-[0.78rem] font-bold text-navy mb-1">Téléphone</label>
            {/* Composite input: the +229 chip is NOT editable — it's a
                visual reminder that the parent should only type the
                10-digit local number (starting with 01). */}
            <div className="flex rounded-lg ring-1 ring-ink-200 focus-within:ring-2 focus-within:ring-navy bg-white overflow-hidden">
              <span
                aria-hidden
                className="flex items-center px-3 bg-ink-50 border-r border-ink-200 font-mono font-bold text-navy text-[0.9rem] select-none"
              >
                +229
              </span>
              <input
                id="annuaire-tel"
                type="tel"
                value={formatLocalTyping(localTel)}
                onChange={(e) => {
                  // Strip spaces/non-digits, cap at 10 digits
                  const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setLocalTel(cleaned)
                }}
                placeholder="01 97 00 00 00"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14} // 10 digits + 4 spaces
                className="flex-1 px-3 py-2.5 bg-white text-navy font-mono text-[0.9rem] outline-none"
              />
            </div>
            <p className="text-[0.7rem] text-ink-500 mt-1">
              Format Bénin : 10 chiffres commençant par 01 (ex. 01 97 00 00 00).
            </p>
          </div>

          {/* Privacy + expiry notice */}
          <div className="rounded-lg bg-info-bg/40 border border-navy/10 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
            <div className="text-[0.76rem] text-ink-700 leading-snug space-y-1">
              <p>
                Votre fiche reste publiée <strong>pendant un an</strong>{' '}
                après chaque mise à jour. Après, elle disparaît
                automatiquement.
              </p>
              <p>
                Vous pouvez la retirer à tout moment.
              </p>
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        {existing && (
          <Button
            variant="ghost"
            onClick={handleDelete}
            disabled={upsert.isPending || del.isPending}
            leadingIcon={<Trash2 className="h-4 w-4" aria-hidden />}
            className="text-danger hover:bg-danger-bg/60"
          >
            Retirer
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          onClick={onClose}
          disabled={upsert.isPending || del.isPending}
        >
          Annuler
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
          loading={upsert.isPending}
        >
          {existing ? 'Enregistrer' : "Rejoindre l'annuaire"}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Visual formatter for the local-digits input: groups as
 * "01 97 00 00 00" as the user types. Digit storage in state
 * stays unformatted (raw digits) so we can validate easily.
 */
function formatLocalTyping(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10)
  const parts: string[] = []
  if (d.length > 0) parts.push(d.slice(0, 2))
  if (d.length > 2) parts.push(d.slice(2, 4))
  if (d.length > 4) parts.push(d.slice(4, 6))
  if (d.length > 6) parts.push(d.slice(6, 8))
  if (d.length > 8) parts.push(d.slice(8, 10))
  return parts.join(' ')
}
