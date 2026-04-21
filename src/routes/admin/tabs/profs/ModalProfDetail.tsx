/**
 * RT-SC · Prof detail modal.
 *
 * Opens when admin taps an active prof row.
 * - Shows assigned classes as badges (read-only — assignment is in its own modal)
 * - Edit matières (comma-separated)
 * - Danger zone: remove prof (deletes the prof doc and removes from
 *   each class's professeursIds; does NOT delete the Firebase Auth account)
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Trash2, Mail, BookOpen, Link as LinkIcon, ShieldCheck, Wallet, User as UserIcon } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { useUpdateProfMatieres, useDeleteProf } from './profUpdateExtras'
import { useUpdateProfRole } from '@/hooks/useProfsMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useAuth } from '@/stores/auth'
import { useClasses } from '@/hooks/useClasses'
import { useProfs } from '@/hooks/useProfs'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'
import type { Professeur, ProfesseurRole } from '@/types/models'

interface ModalProfDetailProps {
  /**
   * The prof this modal was opened for. The modal uses this prop's
   * `id` to look up the CURRENT version from the live `useProfs()`
   * cache — this way when a role change or matières update lands in
   * the cache via onSnapshot, the modal reflects it immediately
   * without needing to be closed and reopened.
   *
   * If the prof is missing from the cache (deleted mid-open), the
   * modal falls back to the prop so the closing animation still
   * has a valid object to render against.
   */
  prof: Professeur | null
  onAssignClasses: (prof: Professeur) => void
  onClose: () => void
}

export function ModalProfDetail({
  prof: propProf,
  onAssignClasses,
  onClose,
}: ModalProfDetailProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const { user: authUser } = useAuth()
  const updateMut = useUpdateProfMatieres()
  const roleMut = useUpdateProfRole()
  const deleteMut = useDeleteProf()
  const { data: classes = [] } = useClasses()
  const { data: allProfs = [] } = useProfs()

  // Prefer the live cache copy so mutations (role, matières, classes)
  // reflect in the open modal immediately. Fall back to the prop if
  // the prof was deleted while the modal was open (exit animation).
  const prof = propProf
    ? allProfs.find((p) => p.id === propProf.id) ?? propProf
    : null

  // Prevent admin from demoting themselves — creates an orphan school
  // with no admin. The button for the self-role is rendered but
  // disabled.
  const isSelf = !!(authUser && prof && authUser.uid === prof.id)

  const [matieres, setMatieres] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Initialize matières field when the modal opens for a new prof.
  // Only keyed on prof.id — we DON'T resync when live cache updates
  // bring new classesIds/role/etc., because doing so would clobber
  // the admin's in-progress edit. If admin wants to reset their
  // unsaved changes, they close and reopen.
  useEffect(() => {
    if (prof) {
      setMatieres((prof.matieres ?? []).join(', '))
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prof?.id])

  const isDirty = useMemo(() => {
    if (!prof) return false
    const cleaned = matieres
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    const current = prof.matieres ?? []
    if (cleaned.length !== current.length) return true
    return cleaned.some((m, i) => m !== current[i])
  }, [prof, matieres])

  const assignedClasses = useMemo(() => {
    if (!prof) return []
    const ids = new Set(prof.classesIds ?? [])
    return classes.filter((c) => ids.has(c.id))
  }, [prof, classes])

  if (!prof) {
    return (
      <Modal open={false} onClose={onClose}>
        {null}
      </Modal>
    )
  }

  async function save() {
    if (!prof) return
    setError(null)

    const cleaned = matieres
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    if (cleaned.length === 0) {
      return setError('Indiquez au moins une matière.')
    }

    try {
      await updateMut.mutateAsync({ profId: prof.id, matieres: cleaned })
      toast.success('Matières mises à jour.')
      onClose()
    } catch {
      setError("Erreur lors de l'enregistrement.")
    }
  }

  async function handleRoleChange(nextRole: ProfesseurRole) {
    if (!prof || prof.role === nextRole) return
    if (isSelf) {
      toast.error('Vous ne pouvez pas modifier votre propre rôle.')
      return
    }
    try {
      await roleMut.mutateAsync({ profId: prof.id, role: nextRole })
      const roleLabel =
        nextRole === 'admin'
          ? 'Admin'
          : nextRole === 'caissier'
            ? 'Caissier'
            : 'Professeur'
      toast.success(`${prof.nom} → ${roleLabel}.`)
    } catch (err) {
      console.error('[role change]', err)
      toast.error('Échec du changement de rôle.')
    }
  }

  async function handleDelete() {
    if (!prof) return
    const ok = await confirm({
      title: `Retirer ${prof.nom} ?`,
      message: `Le professeur n'aura plus accès à la plateforme et sera retiré de toutes ses classes (${prof.classesIds?.length ?? 0}). Le compte Firebase reste créé. Action irréversible côté SchoolConnect.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    })
    if (!ok) return

    try {
      await deleteMut.mutateAsync(prof.id)
      toast.success(`${prof.nom} retiré.`)
      onClose()
    } catch {
      toast.error('Erreur lors de la suppression.')
    }
  }

  return (
    <Modal open={!!prof} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-info-bg text-navy font-display font-bold">
            {prof.nom.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <ModalTitle>{prof.nom}</ModalTitle>
            <ModalDescription className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{prof.email}</span>
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Role picker — admin can switch this prof between the three
            staff roles. Caissier is exclusive: promoting to caissier
            clears classesIds + matieres. Demoting back to prof leaves
            arrays empty so admin re-assigns. */}
        <div className="rounded-md border border-ink-100 bg-white p-3 mb-5">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
            Rôle
          </p>
          <div className="grid grid-cols-3 gap-1">
            <RoleOption
              active={prof.role === 'prof'}
              disabled={isSelf || roleMut.isPending}
              label="Professeur"
              description="Enseigne des classes"
              icon={<UserIcon className="h-3.5 w-3.5" />}
              onClick={() => handleRoleChange('prof')}
            />
            <RoleOption
              active={prof.role === 'caissier'}
              disabled={isSelf || roleMut.isPending}
              label="Caissier"
              description="Finances + admissions"
              icon={<Wallet className="h-3.5 w-3.5" />}
              onClick={() => handleRoleChange('caissier')}
            />
            <RoleOption
              active={prof.role === 'admin'}
              disabled={isSelf || roleMut.isPending}
              label="Admin"
              description="Gestion complète"
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              onClick={() => handleRoleChange('admin')}
            />
          </div>
          {isSelf && (
            <p className="text-[0.7rem] text-ink-500 mt-2 italic">
              Vous ne pouvez pas modifier votre propre rôle.
            </p>
          )}
        </div>

        {/* Assigned classes */}
        {/* Classes + matières — hidden for caissiers (don't teach).
            For admin + prof roles, show them normally. */}
        {prof.role !== 'caissier' && (
          <>
            <div className="rounded-md border border-ink-100 bg-ink-50/40 p-3 mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
                  Classes assignées
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<LinkIcon className="h-3.5 w-3.5" />}
                  onClick={() => onAssignClasses(prof)}
                >
                  Modifier
                </Button>
              </div>
              {assignedClasses.length === 0 ? (
                <p className="text-sm text-ink-400 italic">
                  Aucune classe assignée.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {assignedClasses.map((c) => (
                    <Badge key={c.id} variant="navy" size="sm">
                      {nomClasse(c)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Matières edit */}
            <Textarea
              label="Matières enseignées"
              value={matieres}
              onChange={(e) => {
                setMatieres(e.target.value)
                setError(null)
              }}
              hint="Séparez les matières par des virgules. Ex : Mathématiques, Physique-Chimie"
              rows={2}
              error={error ?? undefined}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {matieres
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean)
                .map((m) => (
                  <Badge key={m} variant="neutral" size="sm" leadingIcon={<BookOpen className="h-3 w-3" />}>
                    {m}
                  </Badge>
                ))}
            </div>
          </>
        )}

        {/* Caissier has no classes/matières — just a tiny note so the
            modal doesn't look empty. */}
        {prof.role === 'caissier' && (
          <div className="rounded-md border border-ink-100 bg-ink-50/40 p-3 mb-5 text-center">
            <Wallet className="h-7 w-7 text-navy/40 mx-auto mb-1" aria-hidden />
            <p className="text-[0.8rem] font-semibold text-ink-700">
              Caissier — finances et admissions
            </p>
            <p className="text-[0.72rem] text-ink-500 mt-1">
              Ce membre du personnel gère le terminal de caisse, le bilan
              et le guichet d'admission. Il ne dispose ni de classes ni
              de matières.
            </p>
          </div>
        )}

        {/* Danger zone */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mt-6 pt-4 border-t border-danger/20"
        >
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-danger mb-3">
            Zone dangereuse
          </p>
          <div className="rounded-md bg-danger-bg border border-danger/20 p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.875rem] font-semibold text-danger">
                Retirer ce professeur
              </p>
              <p className="text-[0.78rem] text-danger/80 mt-0.5 leading-snug">
                Désactive l'accès et le retire de toutes ses classes.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              loading={deleteMut.isPending}
              leadingIcon={<Trash2 className="h-4 w-4" />}
            >
              Retirer
            </Button>
          </div>
        </motion.div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
        <Button
          onClick={save}
          disabled={!isDirty}
          loading={updateMut.isPending}
          leadingIcon={!updateMut.isPending ? <Save className="h-4 w-4" /> : undefined}
        >
          Enregistrer
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Role option pill ──────────────────────────────────────────

function RoleOption({
  active,
  disabled,
  label,
  description,
  icon,
  onClick,
}: {
  active: boolean
  disabled: boolean
  label: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative rounded-md border px-2 py-2 text-left transition-all min-h-[58px]',
        active
          ? 'border-navy bg-navy text-white shadow-sm'
          : 'border-ink-200 bg-white text-ink-700 hover:border-navy/40',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className={cn('flex items-center gap-1 mb-0.5', active ? 'text-gold' : 'text-navy')}>
        {icon}
        <span className="text-[0.72rem] font-bold">{label}</span>
      </div>
      <p
        className={cn(
          'text-[0.64rem] leading-snug',
          active ? 'text-white/80' : 'text-ink-500'
        )}
      >
        {description}
      </p>
    </button>
  )
}
