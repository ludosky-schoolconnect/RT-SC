/**
 * RT-SC · Admin → Élèves tab.
 *
 * Layout:
 *   1. Class selector (mandatory — nothing else loads until one is picked)
 *   2. Action row: search + add élève + export
 *   3. Demographics strip (gender + age distribution)
 *   4. Vault codes panel (collapsed by default)
 *   5. Élèves table (virtualized when >50)
 *
 * The selected classeId is URL-driven (?classe=xxx), so refreshing keeps
 * you on the same class.
 */

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, GraduationCap, FileSpreadsheet, AlertCircle } from 'lucide-react'

import { useClasses } from '@/hooks/useClasses'
import { useEleves } from '@/hooks/useEleves'
import { nomClasse } from '@/lib/benin'
import { exportToExcel } from '@/lib/exporters'
import type { Classe, Eleve } from '@/types/models'

import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { SearchInput } from '@/components/ui/SearchInput'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Section, SectionHeader } from '@/components/layout/Section'
import { useToast } from '@/stores/toast'

import { DemographicsStrip } from './DemographicsStrip'
import { VaultPanel } from './VaultPanel'
import { ElevesTable } from './ElevesTable'
import { ModalCreateEleve } from './ModalCreateEleve'
import { ModalEleveDetail } from './ModalEleveDetail'

export function ElevesTab() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedClasseId = searchParams.get('classe') ?? ''

  const { data: classes, isLoading: classesLoading } = useClasses()
  const { data: eleves = [], isLoading: elevesLoading } = useEleves(
    selectedClasseId || undefined
  )

  const selectedClasse: Classe | null = useMemo(
    () => classes?.find((c) => c.id === selectedClasseId) ?? null,
    [classes, selectedClasseId]
  )
  const classeName = selectedClasse ? nomClasse(selectedClasse) : ''

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailFor, setDetailFor] = useState<Eleve | null>(null)

  function setClasseId(id: string) {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('classe', id)
    else next.delete('classe')
    setSearchParams(next, { replace: true })
    setSearch('')
  }

  // Filter by search term
  const filtered = useMemo(() => {
    if (!search.trim()) return eleves
    const term = search.trim().toLowerCase()
    return eleves.filter((e) => e.nom.toLowerCase().includes(term))
  }, [eleves, search])

  async function exportRoster() {
    if (!selectedClasse || eleves.length === 0) {
      toast.warning('Aucun élève à exporter.')
      return
    }
    try {
      await exportToExcel({
        filename: `eleves-${classeName.replace(/\s+/g, '-')}`,
        sheets: [
          {
            name: 'Élèves',
            columns: [
              { header: 'Nom', accessor: (e: Eleve) => e.nom, width: 30 },
              { header: 'Genre', accessor: (e: Eleve) => (e.genre === 'F' ? 'Féminin' : 'Masculin') },
              { header: 'Date de naissance', accessor: (e: Eleve) => e.date_naissance ?? '', width: 16 },
              { header: 'Contact parent', accessor: (e: Eleve) => e.contactParent ?? '', width: 18 },
            ],
            rows: eleves,
          },
        ],
      })
      toast.success('Liste exportée.')
    } catch {
      toast.error("Échec de l'export.")
    }
  }

  return (
    <>
      <Section>
        <SectionHeader
          kicker="Effectifs"
          title="Gestion des élèves"
          description="Sélectionnez une classe pour voir, ajouter et gérer ses élèves."
        />

        {/* Class selector — always visible */}
        <div className="mb-5">
          <Select
            label="Classe"
            value={selectedClasseId}
            onChange={(e) => setClasseId(e.target.value)}
            disabled={classesLoading || !classes || classes.length === 0}
          >
            <option value="">— Sélectionner une classe —</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {nomClasse(c)}
              </option>
            ))}
          </Select>
        </div>

        {/* Empty: no class selected */}
        {!selectedClasseId && !classesLoading && (
          <EmptyState
            icon={<GraduationCap className="h-10 w-10" />}
            title={
              classes && classes.length === 0
                ? "Aucune classe n'existe encore"
                : 'Sélectionnez une classe'
            }
            description={
              classes && classes.length === 0
                ? "Allez dans l'onglet Classes pour en créer une avant d'ajouter des élèves."
                : 'Choisissez une classe ci-dessus pour voir et gérer ses élèves.'
            }
          />
        )}

        {/* Loading */}
        {selectedClasseId && elevesLoading && (
          <div className="flex justify-center py-10">
            <Spinner size="lg" label="Chargement des élèves…" />
          </div>
        )}

        {/* Error / no class found */}
        {selectedClasseId && !elevesLoading && !selectedClasse && (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-danger" />}
            title="Classe introuvable"
            description="Cette classe a peut-être été supprimée. Choisissez-en une autre dans le sélecteur."
          />
        )}

        {/* Main content */}
        {selectedClasse && !elevesLoading && (
          <div className="space-y-4">
            {/* Action row */}
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput
                onSearch={setSearch}
                placeholder={`Rechercher dans ${classeName}…`}
                containerClassName="flex-1 min-w-[200px]"
              />
              <Button
                variant="secondary"
                onClick={exportRoster}
                leadingIcon={<FileSpreadsheet className="h-4 w-4" />}
              >
                Exporter
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                leadingIcon={<Plus className="h-4 w-4" />}
              >
                Nouvel élève
              </Button>
            </div>

            {/* Demographics */}
            {eleves.length > 0 && <DemographicsStrip eleves={eleves} />}

            {/* Vault */}
            <VaultPanel
              classeId={selectedClasse.id}
              classeName={classeName}
              eleves={eleves}
            />

            {/* Search no-results state */}
            {eleves.length > 0 && filtered.length === 0 && search.trim() && (
              <EmptyState
                title="Aucun résultat"
                description={`Aucun élève ne correspond à « ${search} ».`}
              />
            )}

            {/* Table */}
            {(filtered.length > 0 || eleves.length === 0) && (
              <ElevesTable
                eleves={filtered}
                onSelect={(e) => setDetailFor(e)}
              />
            )}
          </div>
        )}
      </Section>

      {/* Modals */}
      {selectedClasse && (
        <>
          <ModalCreateEleve
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            classeId={selectedClasse.id}
            classeName={classeName}
            existing={eleves}
          />
          <ModalEleveDetail
            eleve={detailFor}
            classeId={selectedClasse.id}
            classeName={classeName}
            existing={eleves}
            onClose={() => setDetailFor(null)}
          />
        </>
      )}
    </>
  )
}
