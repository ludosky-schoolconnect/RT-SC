/**
 * RT-SC · Prof → Annonces tab.
 *
 * ─── Permissions model (5b.2) ───────────────────────────────
 *
 * ALL teaching profs (not just PPs) can post to classes they teach.
 * Rationale: any prof has legitimate communications — homework reminders,
 * material to bring, rescheduling — not just the prof principal. PP is a
 * coordination role for bulletins/oversight, not an announcement gate.
 *
 * Scope of compose:
 *   - Admin only  → "Toute l'école"
 *   - Any prof    → classes they teach (intersection of their classesIds)
 *
 * Edit + delete:
 *   - Author can edit/delete their own annonces (createdBy === user.uid)
 *   - Admin can edit/delete any annonce
 *   - These actions surface inside ModalAnnonceDetail as footer buttons
 *     when the viewer qualifies.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, Plus } from 'lucide-react'

import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useAllAnnonces } from '@/hooks/useAnnonces'
import { useClasses } from '@/hooks/useClasses'
import { useAuthStore } from '@/stores/auth'
import type { Annonce } from '@/types/models'

import { ModalComposeAnnonceProf } from './ModalComposeAnnonceProf'
import { AnnonceRow } from '@/routes/_shared/annonces/AnnonceRow'
import { ModalAnnonceDetail } from '@/routes/_shared/annonces/ModalAnnonceDetail'

export function AnnoncesProfTab() {
  const profil = useAuthStore((s) => s.profil)
  const { data: allClasses = [] } = useClasses()
  const { data: allAnnonces = [], isLoading } = useAllAnnonces()

  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Annonce | null>(null)
  const [selected, setSelected] = useState<Annonce | null>(null)

  function openEdit(annonce: Annonce) {
    setSelected(null)
    setEditing(annonce)
    setComposeOpen(true)
  }

  function closeCompose() {
    setComposeOpen(false)
    setEditing(null)
  }

  // Classes the prof teaches in — their compose-scope options
  const teachingClasses = useMemo(() => {
    const ids = new Set(profil?.classesIds ?? [])
    return allClasses.filter((c) => ids.has(c.id))
  }, [allClasses, profil?.classesIds])

  const canCompose = teachingClasses.length > 0

  // Inbox filter: school-wide + any class the prof teaches
  const profClasseIds = useMemo(
    () => new Set(profil?.classesIds ?? []),
    [profil?.classesIds]
  )

  const visible = useMemo(() => {
    const now = Date.now()
    return allAnnonces.filter((a) => {
      if (a.expiresAt && a.expiresAt.toMillis() < now) return false
      if (a.scope.kind === 'school') return true
      return a.scope.classeIds.some((id) => profClasseIds.has(id))
    })
  }, [allAnnonces, profClasseIds])

  return (
    <Section>
      <SectionHeader
        kicker="Communication"
        title="Annonces"
        description={
          visible.length === 0
            ? 'Aucune annonce pour vous actuellement.'
            : `${visible.length} annonce${visible.length > 1 ? 's' : ''} ${visible.length > 1 ? 'visibles' : 'visible'}.`
        }
        action={
          canCompose && (
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null)
                setComposeOpen(true)
              }}
            >
              Nouvelle annonce
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="Rien à signaler"
          description={
            canCompose
              ? "Vous pouvez créer une annonce pour vos classes via le bouton ci-dessus."
              : "Les communications de la direction et des professeurs apparaîtront ici."
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: Math.min(i * 0.03, 0.25) },
              }}
            >
              <AnnonceRow annonce={a} onOpen={() => setSelected(a)} />
            </motion.div>
          ))}
        </div>
      )}

      {(canCompose || !!editing) && (
        <ModalComposeAnnonceProf
          open={composeOpen}
          onClose={closeCompose}
          teachingClasses={teachingClasses}
          editAnnonce={editing ?? undefined}
        />
      )}

      {selected && (
        <ModalAnnonceDetail
          open={!!selected}
          onClose={() => setSelected(null)}
          annonce={selected}
          onRequestEdit={() => openEdit(selected)}
        />
      )}
    </Section>
  )
}
