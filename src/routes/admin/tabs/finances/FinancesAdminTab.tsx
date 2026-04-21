/**
 * RT-SC · Terminal de caisse — search + trier + paiement flow.
 *
 * This component is the daily-work surface for a caissier. It does
 * ONE thing: find an élève (by class, by name, or both) and open
 * their paiement modal.
 *
 * The Config card + Bilan card that used to live here have been
 * split out to keep responsibilities clean:
 *
 *   - `FinancesConfigCard` is mounted in the ADMIN Année tab
 *     (admin sets fee policy; caissier doesn't touch it).
 *   - `BilanGlobalCard` is its own tab in the caissier dashboard.
 *
 * The component is reused as-is from `/caissier`'s Terminal tab.
 * Status terms throughout match the centralized helper:
 *   Aucun paiement · Paiement partiel · Soldé
 */

import { useMemo, useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useAllEleves, type EleveWithClasse } from '@/hooks/useAllEleves'
import { useClasses } from '@/hooks/useClasses'
import {
  calculerCible,
  getEtatPaiement,
  useFinancesConfig,
} from '@/hooks/useFinances'
import { useElevePaiements, formatFCFA, totalPaiements } from '@/hooks/usePaiements'
import { nomClasse } from '@/lib/benin'
import type { FinancesConfig } from '@/types/models'
import { ModalElevePaiements } from './ModalElevePaiements'

export function FinancesAdminTab() {
  const { data: allEleves = [], isLoading: loadingEleves } = useAllEleves()
  const { data: classes = [] } = useClasses()
  const { data: cfg } = useFinancesConfig()

  const [classeId, setClasseId] = useState<string>('') // '' = all classes
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<EleveWithClasse | null>(null)

  const classesById = useMemo(() => {
    const m = new Map<string, { label: string; niveau?: string }>()
    for (const c of classes) {
      m.set(c.id, { label: nomClasse(c), niveau: c.niveau })
    }
    return m
  }, [classes])

  // Filter pipeline: classe scope first, then text search
  const needle = q.trim().toLowerCase()
  const filtered = useMemo(() => {
    let pool = allEleves
    if (classeId) pool = pool.filter((e) => e.classeId === classeId)
    if (needle) {
      pool = pool.filter((e) => (e.nom ?? '').toLowerCase().includes(needle))
    }
    // Cap result count to keep render fast (50 = generous for any class)
    return pool.slice(0, 100)
  }, [allEleves, classeId, needle])

  // When admin clears the search but leaves a class picked, we still show
  // the class roster. When BOTH are empty, we show only a hint (don't
  // dump 500 élèves).
  const showResults = !!classeId || !!needle
  const totalForScope = classeId
    ? allEleves.filter((e) => e.classeId === classeId).length
    : allEleves.length

  return (
    <Section>
      <SectionHeader
        kicker="Terminal de caisse"
        title="Recherche & paiements"
        description="Trouvez un élève par classe ou par nom pour enregistrer une tranche de paiement."
      />

      <div className="space-y-6">
        {/* Browse — class picker + search coexist */}
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
            Trouver un élève
          </p>

          <div className="rounded-lg border border-ink-100 bg-white p-3 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,2fr] gap-2">
              <Select
                value={classeId}
                onChange={(e) => setClasseId(e.target.value)}
              >
                <option value="">Toutes les classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nomClasse(c)}
                  </option>
                ))}
              </Select>
              <Input
                type="search"
                placeholder={
                  loadingEleves
                    ? 'Chargement…'
                    : classeId
                      ? `Filtrer dans cette classe…`
                      : `Rechercher par nom…`
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                leading={<Search className="h-4 w-4 text-ink-400" />}
                disabled={loadingEleves}
              />
            </div>

            {/* Active scope summary + clear */}
            {(classeId || needle) && (
              <div className="flex items-center gap-2 flex-wrap text-[0.72rem]">
                <span className="text-ink-500">
                  {filtered.length} sur {totalForScope}
                  {classeId && ` dans ${classesById.get(classeId)?.label ?? '?'}`}
                  {needle && ` correspondant à « ${q} »`}
                </span>
                {(classeId || needle) && (
                  <button
                    type="button"
                    onClick={() => {
                      setClasseId('')
                      setQ('')
                    }}
                    className="inline-flex items-center gap-1 text-ink-500 hover:text-navy underline-offset-2 hover:underline"
                  >
                    <X className="h-3 w-3" />
                    réinitialiser
                  </button>
                )}
              </div>
            )}

            {showResults ? (
              filtered.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-8 w-8" />}
                  title="Aucun résultat"
                  description={
                    needle
                      ? `Aucun élève ne correspond à « ${q} »${classeId ? ' dans cette classe' : ''}.`
                      : 'Cette classe ne contient pas encore d\'élève.'
                  }
                />
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((e) => (
                    <ResultRow
                      key={`${e.classeId}-${e.id}`}
                      eleve={e}
                      classeName={classesById.get(e.classeId)?.label ?? '—'}
                      niveau={classesById.get(e.classeId)?.niveau}
                      cfg={cfg}
                      onPick={() => setPicked(e)}
                    />
                  ))}
                </div>
              )
            ) : (
              <p className="text-center text-[0.78rem] text-ink-400 py-4">
                Choisissez une classe ou tapez un nom pour commencer.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Paiement detail modal */}
      <ModalElevePaiements
        open={!!picked}
        eleve={picked}
        classeName={picked ? classesById.get(picked.classeId)?.label ?? '—' : ''}
        niveau={picked ? classesById.get(picked.classeId)?.niveau : undefined}
        onClose={() => setPicked(null)}
      />
    </Section>
  )
}

// ─── Result row — with live état + versé ──────────────────────

function ResultRow({
  eleve,
  classeName,
  niveau,
  cfg,
  onPick,
}: {
  eleve: EleveWithClasse
  classeName: string
  niveau: string | undefined
  cfg: FinancesConfig | undefined
  onPick: () => void
}) {
  // Live read of this élève's paiements. With the React Query cache,
  // multiple ResultRows for élèves in the same class share the same
  // listener once it's been set up (TanStack dedupes by queryKey).
  const { data: paiements = [] } = useElevePaiements(eleve.classeId, eleve.id)

  const cible = cfg ? calculerCible(eleve.genre, niveau, cfg) : 0
  const paye = totalPaiements(paiements)
  const etatInfo =
    cible > 0
      ? getEtatPaiement(paye, cible)
      : { label: 'Non configuré', variant: 'neutral' as const }

  return (
    <button
      type="button"
      onClick={onPick}
      className="group w-full text-left rounded-md border border-ink-100 bg-white p-3 shadow-sm hover:border-navy/30 hover:shadow-md transition-all flex items-center gap-3 min-h-touch"
    >
      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-700 font-bold text-[0.82rem]">
        {(eleve.nom ?? '?').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[0.92rem] text-navy truncate">
          {eleve.nom ?? 'Sans nom'}
        </div>
        <div className="text-[0.7rem] text-ink-500 mt-0.5 truncate">
          {classeName}
          {eleve.matricule && <> · <span className="font-mono">{eleve.matricule}</span></>}
        </div>
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-1">
        <Badge variant={etatInfo.variant} size="sm">
          {etatInfo.label}
        </Badge>
        {cible > 0 && (
          <div className="font-mono text-[0.7rem] text-ink-600">
            {formatFCFA(paye)} <span className="text-ink-400">/ {formatFCFA(cible)}</span>
          </div>
        )}
      </div>
    </button>
  )
}
