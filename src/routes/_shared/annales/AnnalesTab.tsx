/**
 * RT-SC · Shared AnnalesTab.
 *
 * Used by admin (mode='admin'), prof (mode='prof'), and eleve
 * (mode='eleve'). The three modes differ in:
 *
 *   admin   — sees all annales, can add/edit/delete ANY annale
 *   prof    — sees all annales, can add any, edit/delete ONLY own
 *   eleve   — sees only annales matching their classe (exact or
 *             level-prefix), read-only, with search + matière filter
 *
 * Search behavior:
 *   - Free-text search across titre + matière
 *   - Matière dropdown (auto-built from the annales list)
 *   - Admin/prof also get a per-uploader filter (to find "my uploads")
 */

import { useMemo, useState } from 'react'
import {
  Plus,
  Search,
  FolderOpen,
  Library,
  Filter,
} from 'lucide-react'
import { useConfirm } from '@/stores/confirm'
import { useToast } from '@/stores/toast'
import {
  useAllAnnales,
  useAnnalesForClasse,
  useDeleteAnnale,
} from '@/hooks/useAnnales'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { Section, SectionHeader } from '@/components/layout/Section'
import { AnnaleRow } from './AnnaleRow'
import { AnnaleFormModal } from './AnnaleFormModal'
import type { Annale } from '@/types/models'
import { cn } from '@/lib/cn'

interface BaseProps {
  /** The current user — needed for authoring AND for permission checks */
  currentUser: {
    uid: string
    displayName: string
    role: 'admin' | 'prof'
  }
}

interface StaffProps extends BaseProps {
  mode: 'admin' | 'prof'
  /** Not used in staff modes — just here for type narrowing */
  studentClasse?: undefined
}

interface EleveProps {
  mode: 'eleve'
  /** Required in eleve mode — the student's classe name (e.g. "3ème M1") */
  studentClasse: string
  currentUser?: undefined
}

type Props = StaffProps | EleveProps

export function AnnalesTab(props: Props) {
  if (props.mode === 'eleve') {
    return <EleveAnnalesView studentClasse={props.studentClasse} />
  }
  return <StaffAnnalesView mode={props.mode} currentUser={props.currentUser} />
}

// ─── Staff view (admin + prof) ──────────────────────────────────

function StaffAnnalesView({
  mode,
  currentUser,
}: {
  mode: 'admin' | 'prof'
  currentUser: BaseProps['currentUser']
}) {
  const { data: annales = [], isLoading } = useAllAnnales()
  const deleteMut = useDeleteAnnale()
  const confirm = useConfirm()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [matiereFilter, setMatiereFilter] = useState('')
  const [ownOnly, setOwnOnly] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Annale | undefined>(undefined)

  const matieres = useMemo(() => {
    const set = new Set<string>()
    annales.forEach((a) => {
      if (a.matiere) set.add(a.matiere)
    })
    return Array.from(set).sort()
  }, [annales])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return annales.filter((a) => {
      if (ownOnly && a.ajouteParUid !== currentUser.uid) return false
      if (matiereFilter && a.matiere !== matiereFilter) return false
      if (!q) return true
      return (
        a.titre.toLowerCase().includes(q) ||
        a.matiere.toLowerCase().includes(q) ||
        a.classe.toLowerCase().includes(q)
      )
    })
  }, [annales, search, matiereFilter, ownOnly, currentUser.uid])

  function openAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(a: Annale) {
    setEditing(a)
    setFormOpen(true)
  }

  async function handleDelete(a: Annale) {
    const ok = await confirm({
      title: `Supprimer "${a.titre}" ?`,
      message:
        "Cette annale sera retirée pour tous les élèves. Le fichier Google Drive original n'est pas affecté.",
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(a.id)
      toast.success('Annale supprimée.')
    } catch (err) {
      console.error('[AnnalesTab] delete failed:', err)
      toast.error('Erreur lors de la suppression.')
    }
  }

  // Permission helper: can current user edit/delete this annale?
  function canManage(a: Annale): boolean {
    if (mode === 'admin') return true
    // prof: only own
    return a.ajouteParUid === currentUser.uid
  }

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-5">
      <Section>
        <SectionHeader
          title="Annales & devoirs"
          description={
            mode === 'admin'
              ? "Banque d'épreuves partagée avec les élèves."
              : "Partagez des sujets avec vos classes."
          }
          action={
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
              onClick={openAdd}
            >
              Ajouter
            </Button>
          }
        />

        {/* Filters */}
        <div className="space-y-2.5 mb-3">
          <SearchInput
            onSearch={setSearch}
            placeholder="Rechercher par titre, matière ou classe…"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {matieres.length > 0 && (
              <Select
                value={matiereFilter}
                onChange={(e) => setMatiereFilter(e.target.value)}
                containerClassName="flex-1 min-w-[140px]"
              >
                <option value="">Toutes matières</option>
                {matieres.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
            <button
              type="button"
              onClick={() => setOwnOnly((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[0.78rem] font-semibold transition-colors min-h-touch',
                ownOnly
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-ink-300'
              )}
            >
              <Filter className="h-3.5 w-3.5" aria-hidden />
              Mes annales
            </button>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-8 w-8" />}
            title={
              search || matiereFilter || ownOnly
                ? 'Aucune annale ne correspond'
                : 'Aucune annale pour le moment'
            }
            description={
              search || matiereFilter || ownOnly
                ? 'Essayez un autre filtre ou effacez la recherche.'
                : 'Ajoutez un sujet pour démarrer la banque d\'épreuves.'
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => (
              <AnnaleRow
                key={a.id}
                annale={a}
                onEdit={canManage(a) ? () => openEdit(a) : undefined}
                onDelete={canManage(a) ? () => handleDelete(a) : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      <AnnaleFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        existing={editing}
        currentUser={currentUser}
      />
    </div>
  )
}

// ─── Eleve view (read-only, filtered to their classe) ──────────

function EleveAnnalesView({ studentClasse }: { studentClasse: string }) {
  const { data: annales = [], isLoading } = useAnnalesForClasse(studentClasse)
  const [search, setSearch] = useState('')
  const [matiereFilter, setMatiereFilter] = useState('')

  const matieres = useMemo(() => {
    const set = new Set<string>()
    annales.forEach((a) => {
      if (a.matiere) set.add(a.matiere)
    })
    return Array.from(set).sort()
  }, [annales])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return annales.filter((a) => {
      if (matiereFilter && a.matiere !== matiereFilter) return false
      if (!q) return true
      return (
        a.titre.toLowerCase().includes(q) ||
        a.matiere.toLowerCase().includes(q)
      )
    })
  }, [annales, search, matiereFilter])

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-5">
      <Section>
        <SectionHeader
          title="Banque d'épreuves"
          description={`Sujets et devoirs partagés pour ${studentClasse}.`}
        />

        {/* Filters */}
        {!isLoading && annales.length > 0 && (
          <div className="space-y-2.5 mb-3">
            <SearchInput
              onSearch={setSearch}
              placeholder="Rechercher un sujet…"
            />
            {matieres.length > 1 && (
              <Select
                value={matiereFilter}
                onChange={(e) => setMatiereFilter(e.target.value)}
              >
                <option value="">Toutes matières</option>
                {matieres.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : annales.length === 0 ? (
          <EmptyState
            icon={<Library className="h-8 w-8" />}
            title="Pas encore d'annales"
            description="Vos enseignants partageront ici des sujets d'examen et des devoirs. Revenez plus tard."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            title="Aucun résultat"
            description="Essayez un autre mot-clé ou effacez le filtre."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => (
              <AnnaleRow key={a.id} annale={a} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
