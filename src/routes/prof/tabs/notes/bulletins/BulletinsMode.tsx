/**
 * RT-SC · Prof → Notes → Bulletins mode (PP only).
 *
 * Three sections:
 *   1. Selectors (PP class + period; period auto-defaults via BulletinConfig)
 *   2. Cross-matière table with Layer B outlier flags
 *   3. "Générer les bulletins" button + ModalGenerateBulletins
 *
 * Live updates: as profs close their matières, the table re-renders
 * thanks to the underlying onSnapshot subscriptions. Bulletins also
 * re-render live via useBulletins.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  GraduationCap,
  Star,
  Unlock,
  RotateCcw,
  Printer,
} from 'lucide-react'
import { SectionHeader } from '@/components/layout/Section'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'

import { useMyPPClasses } from '@/hooks/useMyPPClasses'
import { useEleves } from '@/hooks/useEleves'
import { useBulletinConfig } from '@/hooks/useBulletinConfig'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useCoefficients } from '@/hooks/useCoefficients'
import { useNotesPourClassePeriode } from '@/hooks/useNotesPourClassePeriode'
import { useUnlockMatiere } from '@/hooks/useNotes'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

import { listPeriodes, currentPeriode } from '@/lib/bulletin'
import { detectOutliers, type LayerBInput } from '@/lib/layerB'
import {
  fetchAllCollesForClass,
  unlockBulletinsForPeriod,
  type GenerationInput,
} from '@/lib/bulletinGeneration'
import { fetchAllPeriodBulletinViews } from '@/lib/pdf/batchBulletinFetch'
import { saveBatchPdf } from '@/lib/pdf/bulletinPdf'
import { nomClasse } from '@/lib/benin'
import type { Classe, Periode } from '@/types/models'

import { CrossMatiereTable } from './CrossMatiereTable'
import { ModalGenerateBulletins } from './ModalGenerateBulletins'
import { ModalBulletinDetail } from '@/routes/_shared/bulletins/ModalBulletinDetail'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import { bulletinsCol } from '@/lib/firestore-keys'

/**
 * Per-period bulletin generation sub-mode (the original BulletinsMode
 * content from Phase 4c-ii). Renders the cross-matière table, generation
 * controls, and unlock actions for ONE selected period.
 */
function PeriodeMode() {
  const { ppClasses } = useMyPPClasses()
  const { data: bulletinConfig } = useBulletinConfig()
  const { data: ecoleConfig } = useEcoleConfig()
  const toast = useToast()
  const qc = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const classeId = searchParams.get('classe') ?? ''
  const periode = (searchParams.get('periode') ?? '') as Periode

  const selectedClasse: Classe | null = useMemo(
    () => ppClasses.find((c) => c.id === classeId) ?? null,
    [ppClasses, classeId]
  )

  // Period options
  const periodOptions = useMemo(() => {
    if (!bulletinConfig) return []
    return listPeriodes(bulletinConfig.typePeriode, bulletinConfig.nbPeriodes)
  }, [bulletinConfig])

  // Auto-default selectors
  useEffect(() => {
    if (!bulletinConfig) return
    let changed = false
    const next = new URLSearchParams(searchParams)

    if (!classeId && ppClasses.length === 1) {
      next.set('classe', ppClasses[0].id)
      changed = true
    }
    if (!periode) {
      next.set(
        'periode',
        currentPeriode(
          bulletinConfig.typePeriode,
          bulletinConfig.nbPeriodes,
          new Date(),
          bulletinConfig.periodeDates
        )
      )
      changed = true
    }
    if (changed) setSearchParams(next, { replace: true })
  }, [bulletinConfig, ppClasses, classeId, periode, searchParams, setSearchParams])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  // Data
  const { data: eleves = [], isLoading: elevesLoading } = useEleves(classeId || undefined)
  const { data: notesData, isLoading: notesLoading } = useNotesPourClassePeriode({
    classeId: classeId || undefined,
    periode: periode || undefined,
  })
  const { data: coefficients = {}, isLoading: coeffLoading } = useCoefficients(
    selectedClasse?.niveau ?? null,
    selectedClasse?.serie ?? null
  )

  // Existing bulletins (live)
  const { data: bulletinByEleve = {} } = useQuery({
    queryKey: ['bulletins-class-period', classeId, periode],
    enabled: !!classeId && !!periode && eleves.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const result: Record<string, true> = {}
      // Parallel fetches per élève
      await Promise.all(
        eleves.map(async (e) => {
          const snap = await getDocs(
            collection(db, bulletinsCol(classeId, e.id))
          )
          if (snap.docs.some((d) => d.id === periode)) {
            result[e.id] = true
          }
        })
      )
      return result
    },
  })

  // Layer B outlier detection
  const layerBResult = useMemo(() => {
    if (!notesData) return { mode: 0, outlierEleveIds: [], distribution: {} }
    const matieres = Object.keys(coefficients).filter(
      (m) => m !== 'Conduite' && coefficients[m] > 0
    )
    if (matieres.length === 0) return { mode: 0, outlierEleveIds: [], distribution: {} }

    // Collect data points across all matières per élève
    const inputs: LayerBInput[] = eleves.map((e) => {
      let dataPoints = 0
      let abandonneAny = false
      for (const m of matieres) {
        const note = notesData.byMatiereByEleve[m]?.[e.id]
        if (!note) continue
        if (note.abandonne) {
          abandonneAny = true
          continue
        }
        const interrosCount = (note.interros ?? []).filter((v) => v !== null && v !== undefined).length
        if (note.devoir1 !== null && note.devoir1 !== undefined) dataPoints++
        if (note.devoir2 !== null && note.devoir2 !== undefined) dataPoints++
        dataPoints += interrosCount
      }
      return { eleveId: e.id, dataPoints, abandonne: abandonneAny }
    })
    return detectOutliers(inputs)
  }, [eleves, notesData, coefficients])

  // Bulletin generation modal state
  const [genOpen, setGenOpen] = useState(false)
  const [genInput, setGenInput] = useState<GenerationInput | null>(null)
  const [preparingGen, setPreparingGen] = useState(false)

  // Bulletin detail modal (PP clicks "Voir" on a generated bulletin)
  const [bulletinOpen, setBulletinOpen] = useState(false)
  const [selectedEleveId, setSelectedEleveId] = useState<string | null>(null)

  function openBulletinFor(eleveId: string) {
    setSelectedEleveId(eleveId)
    setBulletinOpen(true)
  }

  const selectedEleve = useMemo(
    () => eleves.find((e) => e.id === selectedEleveId) ?? null,
    [eleves, selectedEleveId]
  )

  async function openGenerator() {
    if (!classeId || !periode || !bulletinConfig || !notesData) return
    setPreparingGen(true)
    try {
      // Fetch colles for every élève (one-shot)
      const collesByEleve = await fetchAllCollesForClass(
        classeId,
        eleves.map((e) => e.id)
      )
      const input: GenerationInput = {
        classeId,
        periode,
        eleves,
        notesByMatiereByEleve: notesData.byMatiereByEleve,
        coefficients,
        collesByEleve,
        baseConduite: bulletinConfig.baseConduite,
      }
      setGenInput(input)
      setGenOpen(true)
    } catch (err) {
      console.error('[openGenerator] failed:', err)
      toast.error('Échec de la préparation. Voir la console.')
    } finally {
      setPreparingGen(false)
    }
  }

  function onGenerated() {
    toast.success('Bulletins générés avec succès.')
    qc.invalidateQueries({ queryKey: ['bulletins-class-period', classeId, periode] })
    // Also refresh per-élève bulletin queries (used elsewhere later)
    for (const e of eleves) {
      qc.invalidateQueries({ queryKey: ['bulletins', classeId, e.id] })
    }
    // Session 7.1 — also invalidate the AnnualMode query that lists
    // every bulletin for the class. Without this, switching from
    // BulletinsMode to AnnualMode after generating a period's
    // bulletins shows stale "missing" status for up to 30s (the
    // staleTime on that query). The invalidation marks the cache
    // dirty without itself fetching; the actual refetch only happens
    // when AnnualMode is mounted and observes the query, so we don't
    // pay any read cost when the user doesn't visit AnnualMode.
    qc.invalidateQueries({ queryKey: ['all-bulletins-class', classeId] })
  }

  const generatedCount = Object.keys(bulletinByEleve).length

  // ── Unlock features (PP override) ─────────────────────────

  const confirm = useConfirm()
  const unlockMatiereMut = useUnlockMatiere()
  const [unlockingBulletins, setUnlockingBulletins] = useState(false)
  const [printingBatch, setPrintingBatch] = useState(false)

  // Print all bulletins for this period as a single multi-page PDF.
  // Run only when there's at least one generated bulletin. Élèves whose
  // bulletin is missing are silently skipped — that lets PP print
  // partial classes if needed (rare but possible during corrections).
  async function printAllBulletins() {
    if (!classeId || !periode || !ecoleConfig || !bulletinConfig) return
    if (!selectedClasse) return
    if (eleves.length === 0) return
    setPrintingBatch(true)
    try {
      const views = await fetchAllPeriodBulletinViews({
        classeId,
        eleves,
        periode,
        ecoleConfig,
        bulletinConfig,
      })
      if (views.length === 0) {
        toast.error('Aucun bulletin disponible pour cette période.')
        return
      }
      saveBatchPdf(views, 'periode', nomClasse(selectedClasse))
      toast.success(
        `PDF de ${views.length} bulletin${views.length > 1 ? 's' : ''} généré.`
      )
    } catch (err) {
      console.error('[printAllBulletins] failed:', err)
      toast.error('Échec de la génération du PDF.')
    } finally {
      setPrintingBatch(false)
    }
  }

  // Compute which matières are FULLY closed across the whole class
  // (every non-abandoned élève has estCloture: true). Only fully-closed
  // matières are candidates for unlock — partial closures aren't shown.
  const fullyClosedMatieres = useMemo(() => {
    if (!notesData) return [] as string[]
    const matieres = Object.keys(coefficients).filter(
      (m) => m !== 'Conduite' && coefficients[m] > 0
    )
    return matieres.filter((m) => {
      const byEleve = notesData.byMatiereByEleve[m] ?? {}
      // Every élève must either be abandonné or have estCloture: true
      return eleves.every((e) => {
        const note = byEleve[e.id]
        if (!note) return false
        return note.abandonne === true || note.estCloture === true
      })
    })
  }, [eleves, notesData, coefficients])

  async function unlockMatiere(matiere: string) {
    if (!classeId || !periode) return
    const ok = await confirm({
      title: `Déverrouiller ${matiere} ?`,
      message:
        `Le professeur de ${matiere} pourra à nouveau modifier les notes de cette période. ` +
        `Les bulletins déjà générés resteront en place jusqu'à ce que vous les régénériez. ` +
        `Cette action est immédiate.`,
      confirmLabel: 'Déverrouiller',
      variant: 'warning',
    })
    if (!ok) return
    try {
      await unlockMatiereMut.mutateAsync({
        classeId,
        matiere,
        periode,
        eleveIds: eleves.map((e) => e.id),
      })
      toast.success(`${matiere} déverrouillée. Le professeur peut éditer.`)
    } catch {
      toast.error("Échec du déverrouillage.")
    }
  }

  async function unlockBulletins() {
    if (!classeId || !periode || generatedCount === 0) return
    const ok = await confirm({
      title: 'Supprimer les bulletins de la période ?',
      message:
        `Les ${generatedCount} bulletin${generatedCount > 1 ? 's' : ''} ` +
        `de ${periode} seront supprimé${generatedCount > 1 ? 's' : ''}. ` +
        `Vous pourrez les régénérer après corrections. ` +
        `Les notes elles-mêmes ne sont pas modifiées.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    setUnlockingBulletins(true)
    try {
      const result = await unlockBulletinsForPeriod({
        classeId,
        periode,
        eleveIds: eleves.map((e) => e.id),
      })
      if (result.errors.length === 0) {
        toast.success(
          `${result.deletedCount} bulletin${result.deletedCount > 1 ? 's' : ''} supprimé${result.deletedCount > 1 ? 's' : ''}.`
        )
      } else {
        toast.warning(
          `${result.deletedCount} supprimé(s), ${result.errors.length} erreur(s).`
        )
      }
      qc.invalidateQueries({
        queryKey: ['bulletins-class-period', classeId, periode],
      })
      for (const e of eleves) {
        qc.invalidateQueries({ queryKey: ['bulletins', classeId, e.id] })
      }
      // Session 7.1 — same as onGenerated, keep AnnualMode aware.
      qc.invalidateQueries({ queryKey: ['all-bulletins-class', classeId] })
    } catch (err) {
      console.error('[unlockBulletins] failed:', err)
      toast.error('Échec de la suppression.')
    } finally {
      setUnlockingBulletins(false)
    }
  }


  // ── Render ────────────────────────────────────────────────

  if (ppClasses.length === 0) {
    // Shouldn't happen since BulletinsMode is gated, but defensive
    return (
      <EmptyState
        icon={<Star className="h-10 w-10" />}
        title="Vous n'êtes professeur principal d'aucune classe"
        description="Cette section est réservée aux professeurs principaux."
      />
    )
  }

  return (
    <>
      <SectionHeader
        kicker="Bulletins"
        title="Génération des bulletins"
        description="Sélectionnez une de vos classes et la période. Une fois toutes les matières clôturées, vous pouvez générer les bulletins."
      />

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <Select
          label="Classe"
          value={classeId}
          onChange={(e) => setParam('classe', e.target.value)}
        >
          <option value="">— Choisir —</option>
          {ppClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {nomClasse(c)}
            </option>
          ))}
        </Select>
        <Select
          label="Période"
          value={periode}
          onChange={(e) => setParam('periode', e.target.value)}
          disabled={periodOptions.length === 0}
        >
          <option value="">— Choisir —</option>
          {periodOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      {!classeId || !periode || !bulletinConfig ? (
        <EmptyState
          icon={<AlertCircle className="h-10 w-10" />}
          title="Sélectionnez les filtres"
          description="Choisissez une classe et une période pour afficher la grille."
        />
      ) : elevesLoading || notesLoading || coeffLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Chargement…" />
        </div>
      ) : eleves.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-10 w-10" />}
          title="Aucun élève"
          description="Cette classe n'a pas d'élèves."
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {/* Status strip */}
          <div className="rounded-md bg-info-bg/40 border border-navy/15 px-4 py-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 text-[0.8125rem] text-navy leading-snug">
              <strong>{generatedCount}</strong> / <strong>{eleves.length}</strong> bulletin
              {eleves.length > 1 ? 's' : ''} générés pour {periode}.
              {layerBResult.outlierEleveIds.length > 0 && (
                <>
                  {' '}
                  <strong className="text-warning">
                    {layerBResult.outlierEleveIds.length} élève
                    {layerBResult.outlierEleveIds.length > 1 ? 's' : ''}
                  </strong>{' '}
                  à vérifier (moins de notes que la classe).
                </>
              )}
            </div>
          </div>

          {/* Cross-matière table */}
          <CrossMatiereTable
            eleves={eleves}
            notesByMatiereByEleve={notesData?.byMatiereByEleve ?? {}}
            coefficients={coefficients}
            outlierEleveIds={layerBResult.outlierEleveIds}
            bulletinByEleve={bulletinByEleve}
            onOpenBulletin={openBulletinFor}
          />

          {/* PP unlock controls — only render when there's something to unlock */}
          {(fullyClosedMatieres.length > 0 || generatedCount > 0) && (
            <details className="rounded-md border border-ink-100 bg-white p-3 group">
              <summary className="cursor-pointer flex items-center gap-2 text-[0.8125rem] font-semibold text-navy">
                <Unlock className="h-4 w-4 text-warning" aria-hidden />
                Actions PP — déverrouillage
                <span className="text-[0.7rem] text-ink-400 font-normal ml-auto group-open:hidden">
                  {fullyClosedMatieres.length} matière
                  {fullyClosedMatieres.length > 1 ? 's' : ''} clôturée
                  {fullyClosedMatieres.length > 1 ? 's' : ''}
                  {generatedCount > 0
                    ? ` · ${generatedCount} bulletin${generatedCount > 1 ? 's' : ''}`
                    : ''}
                </span>
              </summary>

              <div className="mt-3 space-y-3">
                {fullyClosedMatieres.length > 0 && (
                  <div>
                    <p className="text-[0.78rem] text-ink-600 mb-2">
                      <strong>Déverrouiller une matière</strong> — permet au professeur
                      de modifier les notes après une erreur. Les bulletins déjà générés
                      restent en place jusqu'à leur régénération.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {fullyClosedMatieres.map((m) => (
                        <Button
                          key={m}
                          size="sm"
                          variant="secondary"
                          leadingIcon={<Unlock className="h-3.5 w-3.5" />}
                          onClick={() => unlockMatiere(m)}
                          loading={unlockMatiereMut.isPending}
                        >
                          {m}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {generatedCount > 0 && (
                  <div className="pt-2 border-t border-ink-100">
                    <p className="text-[0.78rem] text-ink-600 mb-2">
                      <strong>Supprimer les bulletins de la période</strong> — pour
                      repartir d'une base propre après plusieurs corrections.
                      Ne supprime PAS les notes saisies par les profs.
                    </p>
                    <p className="text-[0.7rem] text-ink-400 italic mb-2">
                      Pour de petites corrections, « Régénérer les bulletins »
                      suffit (écrase en place).
                    </p>
                    <Button
                      size="sm"
                      variant="danger"
                      leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                      onClick={unlockBulletins}
                      loading={unlockingBulletins}
                    >
                      Supprimer les {generatedCount} bulletin
                      {generatedCount > 1 ? 's' : ''}
                    </Button>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <p className="text-[0.78rem] text-ink-400">
              {selectedClasse ? nomClasse(selectedClasse) : ''} · {periode}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {generatedCount > 0 && (
                <Button
                  onClick={printAllBulletins}
                  loading={printingBatch}
                  variant="secondary"
                  leadingIcon={<Printer className="h-4 w-4" />}
                >
                  Imprimer la classe
                </Button>
              )}
              <Button
                onClick={openGenerator}
                loading={preparingGen}
                variant="primary"
                leadingIcon={<FileText className="h-4 w-4" />}
              >
                {generatedCount > 0 ? 'Régénérer les bulletins' : 'Générer les bulletins'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <ModalGenerateBulletins
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onGenerated={onGenerated}
        input={genInput}
        hasExistingBulletins={generatedCount > 0}
      />

      {selectedEleve && classeId && periode && (
        <ModalBulletinDetail
          open={bulletinOpen}
          onClose={() => setBulletinOpen(false)}
          mode="periode"
          classeId={classeId}
          eleveId={selectedEleve.id}
          periode={periode}
          eleveName={selectedEleve.nom}
        />
      )}
    </>
  )
}

// ─── Wrapper with sub-mode switcher (Période / Annuelle) ────

import { ClipboardCheck, Award as AwardIcon } from 'lucide-react'
import { AnnualMode } from './AnnualMode'

type SubMode = 'periode' | 'annuelle'

/**
 * Public BulletinsMode entry. Hosts a small pill switcher between:
 *   - Période (default): per-period bulletin generation (the Phase 4c-ii flow)
 *   - Annuelle: annual finalization (Phase 4c-iii)
 *
 * URL param `submode` drives selection. Both sub-modes share the `classe`
 * URL param so switching between them doesn't reset the class selection.
 */
export function BulletinsMode() {
  const [searchParams, setSearchParams] = useSearchParams()
  const submode = (searchParams.get('submode') ?? 'periode') as SubMode

  function setSubmode(next: SubMode) {
    const np = new URLSearchParams(searchParams)
    if (next === 'periode') np.delete('submode')
    else np.set('submode', next)
    // When switching to annual mode, drop the periode param so we don't
    // confuse the per-period flow on next switch back
    if (next === 'annuelle') np.delete('periode')
    setSearchParams(np, { replace: true })
  }

  return (
    <>
      {/* Sub-mode pill switcher */}
      <div className="mb-4 flex">
        <div className="inline-flex items-center gap-1 rounded-md bg-white border border-ink-100 p-1 shadow-sm">
          <SubModePill
            active={submode === 'periode'}
            onClick={() => setSubmode('periode')}
            icon={<ClipboardCheck className="h-4 w-4" />}
            label="Période"
          />
          <SubModePill
            active={submode === 'annuelle'}
            onClick={() => setSubmode('annuelle')}
            icon={<AwardIcon className="h-4 w-4" />}
            label="Annuelle"
          />
        </div>
      </div>

      {submode === 'periode' ? <PeriodeMode /> : <AnnualMode />}
    </>
  )
}

function SubModePill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors',
        active ? 'bg-navy text-white' : 'text-ink-500 hover:text-navy',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  )
}
