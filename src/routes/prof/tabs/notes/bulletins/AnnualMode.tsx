/**
 * RT-SC · Prof → Notes → Bulletins → Annuelle sub-mode (PP only).
 *
 * Shows:
 *   - Class selector (PP classes only)
 *   - Status strip: how many periods bulletins generated, blocking issues if any
 *   - Per-élève table: name + per-period moyennes + annual moyenne + statut + rang
 *   - "Clôturer l'année" button → ModalAnnualClosure
 *
 * Read-only after closure unless admin unlocks. The table shows the annual
 * bulletin doc state if it exists.
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Award,
  CheckCircle2,
  GraduationCap,
  Lock,
  Printer,
} from 'lucide-react'
import { SectionHeader } from '@/components/layout/Section'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'

import { useMyPPClasses } from '@/hooks/useMyPPClasses'
import { useEleves } from '@/hooks/useEleves'
import { useBulletinConfig } from '@/hooks/useBulletinConfig'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'

import { listPeriodes } from '@/lib/bulletin'
import {
  fetchAllBulletinsForClass,
  type AnnualGenerationInput,
} from '@/lib/annualClosure'
import { fetchAllAnnualBulletinViews } from '@/lib/pdf/batchBulletinFetch'
import { saveBatchPdf } from '@/lib/pdf/bulletinPdf'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'

import { ModalAnnualClosure } from './ModalAnnualClosure'
import { ModalBulletinDetail } from '@/routes/_shared/bulletins/ModalBulletinDetail'

export function AnnualMode() {
  const { ppClasses } = useMyPPClasses()
  const { data: bulletinConfig } = useBulletinConfig()
  const { data: ecoleConfig } = useEcoleConfig()
  const toast = useToast()
  const qc = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const classeId = searchParams.get('classe') ?? ''

  const selectedClasse = useMemo(
    () => ppClasses.find((c) => c.id === classeId) ?? null,
    [ppClasses, classeId]
  )

  // Session 7 — previously auto-selected the only class when a prof
  // was PP of exactly one. Removed because the auto-default surprised
  // profs who expected to start on "Choisir une classe" and pick
  // explicitly. Letting the user always pick avoids accidental writes
  // when they thought they were on a different surface.

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const { data: eleves = [], isLoading: elevesLoading } = useEleves(
    classeId || undefined
  )

  // Fetch ALL bulletins for the class (per-period + annual if exists)
  const {
    data: allBulletins,
    isLoading: bulletinsLoading,
    refetch: refetchBulletins,
  } = useQuery({
    queryKey: ['all-bulletins-class', classeId],
    enabled: !!classeId && eleves.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      return fetchAllBulletinsForClass(
        classeId,
        eleves.map((e) => e.id)
      )
    },
  })

  // Also need to know which élèves have an annual bulletin already
  const annualByEleve = useMemo(() => {
    if (!allBulletins) return {} as Record<string, boolean>
    // fetchAllBulletinsForClass strips 'Année' from its result, so we need
    // a direct re-check via the eleve doc fields (denormalized).
    // For now: derive from the eleve.statutAnnuel field — that's set iff an
    // annual closure has been written.
    const map: Record<string, boolean> = {}
    for (const e of eleves) {
      if (e.statutAnnuel) map[e.id] = true
    }
    return map
  }, [allBulletins, eleves])

  const annualCount = Object.keys(annualByEleve).length
  const allHaveAnnual = eleves.length > 0 && annualCount === eleves.length

  // Build the AnnualGenerationInput on-demand
  const [modalOpen, setModalOpen] = useState(false)
  const [genInput, setGenInput] = useState<AnnualGenerationInput | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [printingBatch, setPrintingBatch] = useState(false)

  // Print all annual bulletins for the class as a single multi-page PDF.
  // Élèves without an annual bulletin yet are silently skipped.
  async function printAllAnnualBulletins() {
    if (!classeId || !ecoleConfig || !bulletinConfig) return
    if (!selectedClasse) return
    if (eleves.length === 0) return
    setPrintingBatch(true)
    try {
      const views = await fetchAllAnnualBulletinViews({
        classeId,
        eleves,
        ecoleConfig,
        bulletinConfig,
      })
      if (views.length === 0) {
        toast.error('Aucun bulletin annuel disponible.')
        return
      }
      saveBatchPdf(views, 'annuelle', nomClasse(selectedClasse))
      toast.success(
        `PDF de ${views.length} bulletin${views.length > 1 ? 's' : ''} annuel${views.length > 1 ? 's' : ''} généré.`
      )
    } catch (err) {
      console.error('[printAllAnnualBulletins] failed:', err)
      toast.error('Échec de la génération du PDF.')
    } finally {
      setPrintingBatch(false)
    }
  }

  // Annual bulletin detail modal
  const [bulletinOpen, setBulletinOpen] = useState(false)
  const [selectedEleveId, setSelectedEleveId] = useState<string | null>(null)
  const selectedEleve = useMemo(
    () => eleves.find((e) => e.id === selectedEleveId) ?? null,
    [eleves, selectedEleveId]
  )
  function openAnnualBulletin(eleveId: string) {
    setSelectedEleveId(eleveId)
    setBulletinOpen(true)
  }

  async function openClosureModal() {
    if (!classeId || !bulletinConfig || !allBulletins) return
    setPreparing(true)
    try {
      const input: AnnualGenerationInput = {
        classeId,
        eleves,
        bulletinConfig,
        bulletinsByEleveByPeriode: allBulletins,
      }
      setGenInput(input)
      setModalOpen(true)
    } catch (err) {
      console.error('[openClosureModal] failed:', err)
      toast.error('Échec de la préparation. Voir la console.')
    } finally {
      setPreparing(false)
    }
  }

  function onClosed() {
    toast.success('Clôture annuelle effectuée.')
    refetchBulletins()
    qc.invalidateQueries({ queryKey: ['eleves', classeId] })
  }

  // Periods of the year
  const expectedPeriodes = useMemo(() => {
    if (!bulletinConfig) return []
    return listPeriodes(bulletinConfig.typePeriode, bulletinConfig.nbPeriodes)
  }, [bulletinConfig])

  // Per-élève completeness check (informational, not blocking)
  const completenessByEleve = useMemo(() => {
    if (!allBulletins) return {} as Record<string, { complete: number; missing: number }>
    const map: Record<string, { complete: number; missing: number }> = {}
    for (const e of eleves) {
      let complete = 0
      let missing = 0
      for (const p of expectedPeriodes) {
        const bull = allBulletins[e.id]?.[p]
        if (bull && bull.estVerrouille) complete++
        else missing++
      }
      map[e.id] = { complete, missing }
    }
    return map
  }, [allBulletins, eleves, expectedPeriodes])

  const totalReady = useMemo(() => {
    return eleves.filter((e) => completenessByEleve[e.id]?.missing === 0).length
  }, [eleves, completenessByEleve])

  // ── Render ────────────────────────────────────────────────

  if (ppClasses.length === 0) {
    return (
      <EmptyState
        icon={<Award className="h-10 w-10" />}
        title="Vous n'êtes professeur principal d'aucune classe"
        description="Cette section est réservée aux PP."
      />
    )
  }

  return (
    <>
      <SectionHeader
        kicker="Bulletins · Annuelle"
        title="Clôture annuelle"
        description="Une fois tous les bulletins de l'année générés, calculez les moyennes annuelles, le statut et le classement final."
      />

      {/* Class selector */}
      <div className="mb-5">
        <Select
          label="Classe"
          value={classeId}
          onChange={(e) => setParam('classe', e.target.value)}
        >
          <option value="">— Choisir une classe —</option>
          {ppClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {nomClasse(c)}
            </option>
          ))}
        </Select>
      </div>

      {!classeId || !bulletinConfig ? (
        <EmptyState
          icon={<AlertCircle className="h-10 w-10" />}
          title="Sélectionnez une classe"
          description="Choisissez la classe pour laquelle clôturer l'année."
        />
      ) : elevesLoading || bulletinsLoading ? (
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
          <div
            className={cn(
              'rounded-md border px-4 py-3 flex items-start gap-2',
              allHaveAnnual
                ? 'bg-gold/10 border-gold/30'
                : totalReady === eleves.length
                  ? 'bg-success-bg border-success/30'
                  : 'bg-info-bg/40 border-navy/15'
            )}
          >
            {allHaveAnnual ? (
              <Award className="h-4 w-4 text-gold-dark shrink-0 mt-0.5" aria-hidden />
            ) : (
              <CheckCircle2
                className={cn(
                  'h-4 w-4 shrink-0 mt-0.5',
                  totalReady === eleves.length ? 'text-success' : 'text-navy'
                )}
                aria-hidden
              />
            )}
            <div className="flex-1 text-[0.8125rem] leading-snug">
              {allHaveAnnual ? (
                <>
                  <strong className="text-gold-dark">
                    Année clôturée pour cette classe.
                  </strong>{' '}
                  Les fiches élèves ont été mises à jour avec leur moyenne
                  annuelle, leur rang et leur statut.
                </>
              ) : totalReady === eleves.length ? (
                <>
                  <strong className="text-success">
                    Tous les bulletins sont en place.
                  </strong>{' '}
                  Vous pouvez procéder à la clôture annuelle.
                </>
              ) : (
                <>
                  <strong>{totalReady}</strong> / <strong>{eleves.length}</strong> élève
                  {eleves.length > 1 ? 's' : ''} ont tous leurs bulletins.{' '}
                  {eleves.length - totalReady} élève
                  {eleves.length - totalReady > 1 ? 's nécessitent' : ' nécessite'}{' '}
                  encore au moins un bulletin de période.
                </>
              )}
            </div>
          </div>

          {/* Per-élève table */}
          <div className="rounded-lg border border-ink-100 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-ink-50/50 text-ink-400 text-[0.65rem] font-bold uppercase tracking-wider">
                    <th
                      className="sticky left-0 z-10 bg-ink-50 px-3 py-2 text-left min-w-[160px] border-r border-ink-100"
                      scope="col"
                    >
                      Élève
                    </th>
                    {expectedPeriodes.map((p) => (
                      <th
                        key={p}
                        className="px-2 py-2 text-center min-w-[80px] whitespace-nowrap"
                        scope="col"
                      >
                        {p}
                      </th>
                    ))}
                    <th
                      className="px-3 py-2 text-center bg-gold/10 border-l border-ink-100 min-w-[80px]"
                      scope="col"
                    >
                      Moy. annuelle
                    </th>
                    <th
                      className="px-3 py-2 text-center min-w-[70px]"
                      scope="col"
                    >
                      Statut
                    </th>
                    <th
                      className="px-3 py-2 text-center bg-gold/5 min-w-[70px]"
                      scope="col"
                    >
                      Rang
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eleves.map((eleve, idx) => {
                    return (
                      <tr
                        key={eleve.id}
                        className={cn(
                          'border-t border-ink-100',
                          idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/20'
                        )}
                      >
                        <td
                          className={cn(
                            'sticky left-0 z-[5] px-3 py-2 border-r border-ink-100 min-w-[160px]',
                            idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[0.7rem] text-ink-400 font-mono shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            {eleve.statutAnnuel ? (
                              <button
                                type="button"
                                onClick={() => openAnnualBulletin(eleve.id)}
                                className="font-semibold text-navy text-[0.8125rem] truncate hover:text-gold-dark hover:underline transition-colors text-left !min-h-0 !min-w-0"
                                aria-label={`Voir le bulletin annuel de ${eleve.nom}`}
                              >
                                {eleve.nom}
                              </button>
                            ) : (
                              <span className="font-semibold text-navy text-[0.8125rem] truncate">
                                {eleve.nom}
                              </span>
                            )}
                          </div>
                        </td>
                        {expectedPeriodes.map((p) => {
                          const bull = allBulletins?.[eleve.id]?.[p]
                          if (!bull) {
                            return (
                              <td key={p} className="px-2 py-2 text-center">
                                <span className="text-ink-300 text-xs">·</span>
                              </td>
                            )
                          }
                          return (
                            <td key={p} className="px-2 py-2 text-center align-middle">
                              <span
                                className={cn(
                                  'font-mono tabular-nums text-[0.78rem] font-semibold',
                                  bull.moyenneGenerale >= 10
                                    ? 'text-success'
                                    : 'text-danger'
                                )}
                              >
                                {bull.moyenneGenerale.toFixed(2)}
                              </span>
                            </td>
                          )
                        })}
                        {/* Annual moyenne (from denormalized eleve doc) */}
                        <td className="px-3 py-2 text-center bg-gold/10 border-l border-ink-100 align-middle">
                          {eleve.moyenneAnnuelle !== undefined ? (
                            <span
                              className={cn(
                                'font-display tabular-nums text-base font-bold',
                                eleve.moyenneAnnuelle >= 10
                                  ? 'text-success'
                                  : 'text-danger'
                              )}
                            >
                              {eleve.moyenneAnnuelle.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center align-middle">
                          {eleve.statutAnnuel ? (
                            <Badge
                              variant={
                                eleve.statutAnnuel === 'Admis' ? 'success' : 'navy'
                              }
                              size="sm"
                            >
                              {eleve.statutAnnuel}
                            </Badge>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center bg-gold/5 align-middle">
                          {eleve.rang ? (
                            <span className="font-semibold text-navy text-[0.78rem] tabular-nums">
                              {eleve.rang}
                            </span>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <p className="text-[0.78rem] text-ink-400">
              {selectedClasse ? nomClasse(selectedClasse) : ''} ·{' '}
              {expectedPeriodes.length} période
              {expectedPeriodes.length > 1 ? 's' : ''} · Formule{' '}
              {bulletinConfig?.formuleAnnuelle === 'simple' ? 'simple' : 'standard'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {annualCount > 0 && (
                <Button
                  onClick={printAllAnnualBulletins}
                  loading={printingBatch}
                  variant="secondary"
                  leadingIcon={<Printer className="h-4 w-4" />}
                >
                  Imprimer la classe
                </Button>
              )}
              <Button
                onClick={openClosureModal}
                loading={preparing}
                variant={allHaveAnnual ? 'secondary' : 'primary'}
                disabled={totalReady !== eleves.length}
                leadingIcon={
                  allHaveAnnual ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Award className="h-4 w-4" />
                  )
                }
              >
                {allHaveAnnual
                  ? 'Régénérer la clôture annuelle'
                  : 'Clôturer l\'année'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <ModalAnnualClosure
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onClosed={onClosed}
        input={genInput}
        hasExistingAnnual={allHaveAnnual}
      />

      {selectedEleve && classeId && (
        <ModalBulletinDetail
          open={bulletinOpen}
          onClose={() => setBulletinOpen(false)}
          mode="annuelle"
          classeId={classeId}
          eleveId={selectedEleve.id}
          eleveName={selectedEleve.nom}
        />
      )}
    </>
  )
}
