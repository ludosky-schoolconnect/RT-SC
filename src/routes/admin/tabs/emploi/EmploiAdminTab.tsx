/**
 * RT-SC · Admin → Emploi du temps tab.
 *
 * Class picker → grid of séances for that class, grouped by jour.
 * Admin adds new séances via the "Nouvelle séance" button (modal composer).
 * Each séance row has edit + delete actions.
 *
 * The class picker defaults to the first class alphabetically. Changing
 * the class flushes the edit target (can't accidentally edit a séance
 * for a class you can't see).
 */

import { useMemo, useState } from 'react'
import { Plus, Calendar, Pencil, Trash2 } from 'lucide-react'

import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'

import { useClasses } from '@/hooks/useClasses'
import { useProfs } from '@/hooks/useProfs'
import { useAllSeances } from '@/hooks/useSeances'
import { useDeleteSeance } from '@/hooks/useSeancesMutations'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { nomClasse } from '@/lib/benin'

import { EmploiGrid } from '@/routes/_shared/emploi/EmploiGrid'
import { ModalComposeSeance } from './ModalComposeSeance'
import type { Seance } from '@/types/models'

export function EmploiAdminTab() {
  const { data: classes = [] } = useClasses()
  const { data: profs = [] } = useProfs()
  const { data: allSeances = [], isLoading } = useAllSeances()
  const deleteMut = useDeleteSeance()
  const toast = useToast()
  const confirm = useConfirm()

  const [classeId, setClasseId] = useState<string>('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Seance | null>(null)

  // Default to first class once data arrives
  const effectiveClasseId = classeId || classes[0]?.id || ''

  const classeSeances = useMemo(
    () =>
      effectiveClasseId
        ? allSeances.filter((s) => s.classeId === effectiveClasseId)
        : [],
    [allSeances, effectiveClasseId]
  )

  const profNameById = useMemo(() => {
    const map = new Map<string, string>()
    profs.forEach((p) => map.set(p.id, p.nom))
    return map
  }, [profs])

  function openCreate() {
    setEditing(null)
    setComposeOpen(true)
  }

  function openEdit(s: Seance) {
    setEditing(s)
    setComposeOpen(true)
  }

  function closeCompose() {
    setComposeOpen(false)
    setEditing(null)
  }

  async function handleDelete(s: Seance) {
    const ok = await confirm({
      title: 'Supprimer la séance ?',
      message: `« ${s.matiere} » — ${s.jour} ${s.heureDebut}–${s.heureFin} sera supprimée définitivement.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(s.id)
      toast.success('Séance supprimée.')
    } catch (err) {
      console.error('[EmploiAdminTab] delete error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  const classe = classes.find((c) => c.id === effectiveClasseId)

  return (
    <Section>
      <SectionHeader
        kicker="Organisation"
        title="Emploi du temps"
        description={
          classes.length === 0
            ? 'Créez d\'abord des classes pour composer leur emploi du temps.'
            : classeSeances.length === 0
              ? `${classe ? nomClasse(classe) : '—'} : aucune séance programmée.`
              : `${classeSeances.length} séance${classeSeances.length > 1 ? 's' : ''} en ${classe ? nomClasse(classe) : '—'}.`
        }
        action={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            disabled={!effectiveClasseId}
          >
            Nouvelle séance
          </Button>
        }
      />

      {classes.length > 0 && (
        <div className="mb-5 max-w-sm">
          <Select
            label="Classe affichée"
            value={effectiveClasseId}
            onChange={(e) => setClasseId(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {nomClasse(c)}
              </option>
            ))}
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title="Aucune classe"
          description="Ajoutez des classes dans l'onglet « Classes » avant de composer un emploi du temps."
        />
      ) : classeSeances.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title={`Aucune séance pour ${classe ? nomClasse(classe) : 'cette classe'}`}
          description="Appuyez sur « Nouvelle séance » pour commencer à composer l'emploi du temps."
          action={
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={openCreate}
            >
              Nouvelle séance
            </Button>
          }
        />
      ) : (
        <EmploiGrid
          seances={classeSeances}
          subtitleFor={(s) => profNameById.get(s.profId) ?? '—'}
          onSeanceClick={openEdit}
          renderActions={(s) => (
            <>
              <IconButton
                variant="ghost"
                aria-label="Modifier la séance"
                onClick={() => openEdit(s)}
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton
                variant="danger"
                aria-label="Supprimer la séance"
                onClick={() => handleDelete(s)}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </>
          )}
          emptyDayText="Journée libre."
        />
      )}

      <ModalComposeSeance
        open={composeOpen}
        onClose={closeCompose}
        defaultClasseId={effectiveClasseId}
        editSeance={editing ?? undefined}
      />
    </Section>
  )
}
