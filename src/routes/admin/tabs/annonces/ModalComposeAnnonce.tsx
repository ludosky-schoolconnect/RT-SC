/**
 * RT-SC · Admin → Annonces → Compose modal.
 *
 * Form for creating a new annonce. Four fields:
 *   - Title (required)
 *   - Body (markdown, required)
 *   - Scope: school-wide OR specific classes
 *   - Priority: info / important / urgent
 *
 * Optional: expiration date (hidden by a toggle to keep the form simple
 * by default). If not set, annonce persists indefinitely.
 *
 * Edit mode: when `annonceId` is provided, form pre-fills and calls
 * update instead of create. Skipped in first 5b ship (create only) —
 * wired once 5b.1 adds edit/delete.
 */

import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Megaphone, AlertCircle, AlertTriangle, Info } from 'lucide-react'
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
import { Textarea } from '@/components/ui/Textarea'
import { Radio, Checkbox } from '@/components/ui/Checkbox'
import { useClasses } from '@/hooks/useClasses'
import { useCreateAnnonce, useUpdateAnnonce } from '@/hooks/useAnnoncesMutations'
import { useToast } from '@/stores/toast'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'
import type { Annonce, AnnoncePriority } from '@/types/models'

interface Props {
  open: boolean
  onClose: () => void
  /** When provided, modal opens in EDIT mode with fields pre-filled. */
  editAnnonce?: Annonce
}

type ScopeMode = 'school' | 'classes'

export function ModalComposeAnnonce({ open, onClose, editAnnonce }: Props) {
  const { data: classes = [] } = useClasses()
  const createMut = useCreateAnnonce()
  const updateMut = useUpdateAnnonce()
  const toast = useToast()

  const isEdit = !!editAnnonce

  // Derived initial values (recomputed when editAnnonce changes)
  const [title, setTitle] = useState(editAnnonce?.title ?? '')
  const [body, setBody] = useState(editAnnonce?.body ?? '')
  const [priority, setPriority] = useState<AnnoncePriority>(editAnnonce?.priority ?? 'info')
  const [scopeMode, setScopeMode] = useState<ScopeMode>(
    editAnnonce?.scope.kind === 'school' ? 'school' : editAnnonce ? 'classes' : 'school'
  )
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    new Set(editAnnonce?.scope.kind === 'classes' ? editAnnonce.scope.classeIds : [])
  )
  const [expiresEnabled, setExpiresEnabled] = useState(!!editAnnonce?.expiresAt)
  const [expiresDate, setExpiresDate] = useState(() => {
    if (!editAnnonce?.expiresAt) return ''
    try {
      return editAnnonce.expiresAt.toDate().toISOString().split('T')[0]
    } catch {
      return ''
    }
  })
  const [titleErr, setTitleErr] = useState<string | null>(null)
  const [bodyErr, setBodyErr] = useState<string | null>(null)
  const [scopeErr, setScopeErr] = useState<string | null>(null)

  // Re-hydrate when editAnnonce changes (e.g. opening edit on a different row)
  useEffect(() => {
    if (!editAnnonce) return
    setTitle(editAnnonce.title)
    setBody(editAnnonce.body)
    setPriority(editAnnonce.priority)
    setScopeMode(editAnnonce.scope.kind === 'school' ? 'school' : 'classes')
    setSelectedClasses(
      new Set(editAnnonce.scope.kind === 'classes' ? editAnnonce.scope.classeIds : [])
    )
    setExpiresEnabled(!!editAnnonce.expiresAt)
    setExpiresDate(
      editAnnonce.expiresAt
        ? editAnnonce.expiresAt.toDate().toISOString().split('T')[0]
        : ''
    )
    setTitleErr(null)
    setBodyErr(null)
    setScopeErr(null)
  }, [editAnnonce])

  function toggleClasse(id: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setScopeErr(null)
  }

  function resetForm() {
    setTitle('')
    setBody('')
    setPriority('info')
    setScopeMode('school')
    setSelectedClasses(new Set())
    setExpiresEnabled(false)
    setExpiresDate('')
    setTitleErr(null)
    setBodyErr(null)
    setScopeErr(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTitleErr(null)
    setBodyErr(null)
    setScopeErr(null)

    const t = title.trim()
    const b = body.trim()
    if (!t) {
      setTitleErr('Le titre est requis.')
      return
    }
    if (t.length > 120) {
      setTitleErr('Le titre doit faire 120 caractères maximum.')
      return
    }
    if (!b) {
      setBodyErr('Le contenu est requis.')
      return
    }
    if (scopeMode === 'classes' && selectedClasses.size === 0) {
      setScopeErr('Sélectionnez au moins une classe.')
      return
    }

    let expiresAt: Timestamp | null = null
    if (expiresEnabled && expiresDate) {
      // Date input returns YYYY-MM-DD; set to end-of-day in local tz
      const d = new Date(expiresDate + 'T23:59:59')
      if (!isNaN(d.getTime())) expiresAt = Timestamp.fromDate(d)
    }

    try {
      const payload = {
        title: t,
        body: b,
        priority,
        scope:
          scopeMode === 'school'
            ? ({ kind: 'school' } as const)
            : ({ kind: 'classes' as const, classeIds: Array.from(selectedClasses) }),
        expiresAt,
      }
      if (isEdit && editAnnonce) {
        await updateMut.mutateAsync({ ...payload, id: editAnnonce.id })
        toast.success('Annonce mise à jour.')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Annonce publiée.')
      }
      resetForm()
      onClose()
    } catch (err) {
      console.error('[ComposeAnnonce] error:', err)
      toast.error(
        isEdit
          ? 'Échec de la mise à jour.'
          : 'Échec de la publication. Vérifiez vos droits et réessayez.'
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <ModalHeader onClose={onClose}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning/30">
            <Megaphone className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <ModalTitle>{isEdit ? "Modifier l'annonce" : 'Nouvelle annonce'}</ModalTitle>
            <ModalDescription>
              {isEdit
                ? 'Les modifications seront visibles immédiatement par les destinataires.'
                : "Communiquez avec les familles et les équipes. Les annonces apparaissent sur l'Accueil des destinataires."}
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ModalBody className="space-y-5">
          <Input
            label="Titre"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleErr(null)
            }}
            placeholder="Ex : Réunion parents-profs le 10 mai"
            maxLength={120}
            error={titleErr ?? undefined}
            hint={titleErr ? undefined : `${title.length}/120`}
            autoFocus
          />

          <Textarea
            label="Contenu"
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              setBodyErr(null)
            }}
            placeholder={
              "Détails de l'annonce...\n\nLe **markdown** est supporté : gras, _italique_, listes, liens."
            }
            rows={8}
            error={bodyErr ?? undefined}
            hint={
              bodyErr
                ? undefined
                : 'Markdown supporté : **gras**, _italique_, listes avec « - », liens [texte](url).'
            }
          />

          {/* Priority */}
          <div className="space-y-2">
            <p className="text-[0.78rem] font-semibold text-navy">Priorité</p>
            <div className="grid grid-cols-3 gap-2">
              <PriorityPick
                value="info"
                current={priority}
                onChange={setPriority}
                icon={<Info className="h-4 w-4" />}
                label="Info"
                tone="info"
              />
              <PriorityPick
                value="important"
                current={priority}
                onChange={setPriority}
                icon={<AlertCircle className="h-4 w-4" />}
                label="Important"
                tone="warning"
              />
              <PriorityPick
                value="urgent"
                current={priority}
                onChange={setPriority}
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Urgent"
                tone="danger"
              />
            </div>
          </div>

          {/* Scope */}
          <div className="space-y-2">
            <p className="text-[0.78rem] font-semibold text-navy">Destinataires</p>
            <div className="space-y-2">
              <Radio
                name="scope"
                checked={scopeMode === 'school'}
                onChange={() => {
                  setScopeMode('school')
                  setScopeErr(null)
                }}
                label="Toute l'école"
                description="Tous les élèves, parents et professeurs."
              />
              <Radio
                name="scope"
                checked={scopeMode === 'classes'}
                onChange={() => setScopeMode('classes')}
                label="Classes spécifiques"
                description="Cochez une ou plusieurs classes ci-dessous."
              />
            </div>
            {scopeMode === 'classes' && (
              <div className="mt-2 rounded-lg border border-ink-100 bg-ink-50/40 p-3 max-h-56 overflow-y-auto space-y-2">
                {classes.length === 0 ? (
                  <p className="text-[0.78rem] text-ink-500 italic">
                    Aucune classe configurée.
                  </p>
                ) : (
                  classes.map((c) => (
                    <Checkbox
                      key={c.id}
                      checked={selectedClasses.has(c.id)}
                      onChange={() => toggleClasse(c.id)}
                      label={nomClasse(c)}
                    />
                  ))
                )}
              </div>
            )}
            {scopeErr && (
              <p className="text-[0.78rem] text-danger">{scopeErr}</p>
            )}
          </div>

          {/* Expiration (optional) */}
          <div className="space-y-2">
            <Checkbox
              checked={expiresEnabled}
              onChange={(e) => setExpiresEnabled(e.target.checked)}
              label="Définir une date d'expiration"
              description="L'annonce disparaîtra des destinataires après cette date."
            />
            {expiresEnabled && (
              <input
                type="date"
                value={expiresDate}
                onChange={(e) => setExpiresDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-md border border-ink-200 px-3 py-2 text-[0.9rem] text-navy bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
              />
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={createMut.isPending || updateMut.isPending}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={createMut.isPending || updateMut.isPending}
            leadingIcon={<Megaphone className="h-4 w-4" />}
          >
            {isEdit ? 'Enregistrer' : "Publier l'annonce"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// ─── Priority picker ────────────────────────────────────────

function PriorityPick({
  value,
  current,
  onChange,
  icon,
  label,
  tone,
}: {
  value: AnnoncePriority
  current: AnnoncePriority
  onChange: (v: AnnoncePriority) => void
  icon: React.ReactNode
  label: string
  tone: 'info' | 'warning' | 'danger'
}) {
  const isActive = current === value
  const toneClasses = {
    info: isActive
      ? 'bg-info-bg ring-navy text-navy'
      : 'bg-white ring-ink-200 text-ink-500 hover:ring-navy/40',
    warning: isActive
      ? 'bg-warning-bg ring-warning text-warning'
      : 'bg-white ring-ink-200 text-ink-500 hover:ring-warning/40',
    danger: isActive
      ? 'bg-danger-bg ring-danger text-danger'
      : 'bg-white ring-ink-200 text-ink-500 hover:ring-danger/40',
  }[tone]

  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        'flex flex-col items-center gap-1 py-2.5 rounded-lg ring-2 transition-all min-h-touch',
        toneClasses,
        isActive && 'shadow-[0_2px_8px_-2px_rgba(11,37,69,0.1)]'
      )}
    >
      {icon}
      <span className="text-[0.78rem] font-semibold">{label}</span>
    </button>
  )
}
