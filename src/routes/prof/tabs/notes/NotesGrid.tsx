/**
 * RT-SC · Notes grid for one (classe, matière, période).
 *
 * One row per élève. Layout:
 *   Élève | Interrogations (variable count, 1 to MAX_INTERROS) | Dev1 | Dev2 | M.I. | Moy.
 *
 * Each cell autosaves via useDebouncedSave (500ms debounce).
 * Status indicators per cell. Locked rows (estCloture) are read-only.
 *
 * Closure guard (Phase 4b.2 lightweight version, not the full Phase 4c
 * intelligence): warns admin if any rows are completely empty before
 * locking. Phase 4c will add Layer A (per-matière completeness with
 * abandon flag) + Layer B (mode-based trend check).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Lock,
  Calculator,
  GraduationCap,
  Plus,
  X,
  AlertOctagon,
} from 'lucide-react'
import {
  moyenneInterros as computeMI,
  moyenneMatiere as computeMM,
  calculerBarometre,
  computeRanking,
  type RankResult,
} from '@/lib/bulletin'
import {
  useNotesPourMatierePeriode,
  useSaveNote,
} from '@/hooks/useNotes'
import { useDebouncedSave } from '@/hooks/useDebouncedSave'
import { useEleves } from '@/hooks/useEleves'
import { useToast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import type { Eleve, Periode } from '@/types/models'
import { NoteCell } from './NoteCell'
import { MatiereBarometre } from './MatiereBarometre'
import {
  ModalClosureMatiere,
  type ClosureRowSnapshot,
  type ClosureCommit,
} from './ModalClosureMatiere'
import { ModalGiveColle } from '@/routes/_shared/colles/ModalGiveColle'

interface NotesGridProps {
  classeId: string
  matiere: string
  periode: Periode
}

interface RowState {
  interros: (number | null)[]  // variable length, nulls preserved for slot stability
  devoir1: number | null
  devoir2: number | null
  estCloture: boolean
}

const MAX_INTERROS = 10
const MIN_INTERROS = 1

function freshRow(): RowState {
  return {
    interros: [null],
    devoir1: null,
    devoir2: null,
    estCloture: false,
  }
}

/** Format a moyenne value safely. Never returns "NaN". */
function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return v.toFixed(2)
}

export function NotesGrid({ classeId, matiere, periode }: NotesGridProps) {
  const toast = useToast()
  const profilUid = useAuthStore((s) => s.user?.uid)

  const { data: eleves = [], isLoading: elevesLoading } = useEleves(classeId)
  const { data: notesData = [], isLoading: notesLoading } =
    useNotesPourMatierePeriode({ classeId, matiere, periode })
  const saveMut = useSaveNote()

  // Local working state, keyed by élève id
  const [rows, setRows] = useState<Record<string, RowState>>({})

  // Hydrate from saved data
  useEffect(() => {
    const next: Record<string, RowState> = {}
    for (const e of eleves) {
      const found = notesData.find((nd) => nd.eleveId === e.id)
      if (found) {
        const saved = (found.note.interros ?? []).filter(
          (v) => v !== null && v !== undefined
        ) as number[]
        // Always show at least MIN_INTERROS slots
        const interros: (number | null)[] = saved.length === 0 ? [null] : saved
        next[e.id] = {
          interros,
          devoir1: found.note.devoir1 ?? null,
          devoir2: found.note.devoir2 ?? null,
          estCloture: found.note.estCloture === true,
        }
      } else {
        next[e.id] = freshRow()
      }
    }
    setRows(next)
  }, [eleves, notesData])

  // Save handler — strips nulls from interros before write
  const onSaveRow = useCallback(
    async (eleveId: string, row: RowState) => {
      const cleanInterros = row.interros.filter(
        (v): v is number => v !== null
      )
      await saveMut.mutateAsync({
        classeId,
        eleveId,
        matiere,
        periode,
        interros: cleanInterros,
        devoir1: row.devoir1,
        devoir2: row.devoir2,
        professeurId: profilUid ?? '',
      })
    },
    [saveMut, classeId, matiere, periode, profilUid]
  )

  const { statuses, schedule } = useDebouncedSave<RowState>({
    onSave: onSaveRow,
  })

  function updateRow(eleveId: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const cur = prev[eleveId] ?? freshRow()
      const next = { ...cur, ...patch }
      schedule(eleveId, next)
      return { ...prev, [eleveId]: next }
    })
  }

  function setInterro(eleveId: string, idx: number, value: number | null) {
    const cur = rows[eleveId] ?? freshRow()
    const nextArr = [...cur.interros]
    nextArr[idx] = value
    updateRow(eleveId, { interros: nextArr })
  }

  function addInterro(eleveId: string) {
    const cur = rows[eleveId] ?? freshRow()
    if (cur.interros.length >= MAX_INTERROS) return
    updateRow(eleveId, { interros: [...cur.interros, null] })
  }

  function removeInterro(eleveId: string, idx: number) {
    const cur = rows[eleveId] ?? freshRow()
    if (cur.interros.length <= MIN_INTERROS) return
    const nextArr = cur.interros.filter((_, i) => i !== idx)
    updateRow(eleveId, { interros: nextArr })
  }

  // ─── Closure (Phase 4c-i): driven by ModalClosureMatiere ─────
  // The modal classifies each élève (Complet / Incomplet / Vide) and
  // forces explicit per-élève resolution before locking. See
  // ./ModalClosureMatiere.tsx and lib/closure.ts.

  const [closing, setClosing] = useState(false)
  const [closureModalOpen, setClosureModalOpen] = useState(false)

  // Colle modal — opens scoped to one élève
  const [colleEleveId, setColleEleveId] = useState<string | null>(null)
  const [colleOpen, setColleOpen] = useState(false)
  function openColleFor(eleveId: string) {
    setColleEleveId(eleveId)
    setColleOpen(true)
  }
  function closeColle() {
    setColleOpen(false)
  }
  const colleEleve = useMemo(
    () => eleves.find((e) => e.id === colleEleveId) ?? null,
    [eleves, colleEleveId]
  )

  // Snapshots driving the modal's classification
  const closureSnapshots: ClosureRowSnapshot[] = useMemo(() => {
    return eleves.map((e) => {
      const r = rows[e.id] ?? freshRow()
      return {
        eleveId: e.id,
        interrosCount: r.interros.filter((v) => v !== null).length,
        hasAnyDevoir: r.devoir1 !== null || r.devoir2 !== null,
      }
    })
  }, [eleves, rows])

  function openClosureModal() {
    setClosureModalOpen(true)
  }

  function returnToEntry(eleveId: string) {
    // Scroll the row into view + flash highlight. Best-effort — the row
    // element id is `note-row-{eleveId}`. If the row isn't rendered (rare,
    // e.g. virtualized future), this is a no-op.
    requestAnimationFrame(() => {
      const el = document.getElementById(`note-row-${eleveId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-warning', 'ring-offset-2')
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-warning', 'ring-offset-2')
        }, 1800)
      }
    })
  }

  async function commitClosure(commits: ClosureCommit[]) {
    setClosing(true)
    let success = 0
    let errors = 0
    const succeededIds: string[] = []
    for (const commit of commits) {
      const row = rows[commit.eleveId] ?? freshRow()
      const cleanInterros = row.interros.filter(
        (v): v is number => v !== null
      )
      try {
        await saveMut.mutateAsync({
          classeId,
          eleveId: commit.eleveId,
          matiere,
          periode,
          interros: cleanInterros,
          devoir1: row.devoir1,
          devoir2: row.devoir2,
          professeurId: profilUid ?? '',
          cloturer: true,
          abandonne: commit.action === 'abandonner',
        })
        success++
        succeededIds.push(commit.eleveId)
      } catch {
        errors++
      }
    }
    // Optimistic UI: mark every successfully-closed row as locked locally,
    // without waiting for the snapshot to round-trip. The next snapshot
    // update will reconcile authoritatively.
    if (succeededIds.length > 0) {
      setRows((prev) => {
        const next = { ...prev }
        for (const id of succeededIds) {
          if (next[id]) next[id] = { ...next[id], estCloture: true }
        }
        return next
      })
    }
    setClosing(false)
    setClosureModalOpen(false)
    if (errors === 0) {
      toast.success(
        `Clôture réussie pour ${success} élève${success > 1 ? 's' : ''}.`
      )
    } else {
      toast.warning(`${success} clôturé(s), ${errors} erreur(s).`)
    }
  }


  const allClosed = useMemo(
    () =>
      eleves.length > 0 && eleves.every((e) => rows[e.id]?.estCloture === true),
    [eleves, rows]
  )
  const anyClosed = useMemo(
    () => eleves.some((e) => rows[e.id]?.estCloture === true),
    [eleves, rows]
  )

  // ─── Baromètre + per-matière rank ───────────────────────────
  // Session 7 — uses BOTH the Firestore snapshot view (notesData) AND
  // the local rows state. This is read-free: we never fetch anything
  // extra, we just trust the optimistic update from the closure flow.
  //
  // Background: closing a matière writes N notes via setDoc, which
  // updates the Firestore local cache synchronously. The onSnapshot
  // listener should fire immediately after each write. In practice
  // there can be a perceptible delay (mobile, LTE, tab backgrounded)
  // before useQuery subscribers re-render with the updated cache.
  // During that window, the user saw the "Clôturé" badge appear (from
  // the optimistic rows update on line ~263) but the Baromètre stayed
  // missing because closedSavedNotes only read from notesData.
  //
  // The fix: when a row is locally marked estCloture=true AND has the
  // raw inputs to compute a moyenne, treat it as "closed" for stat
  // purposes immediately. The snapshot will eventually catch up; when
  // it does, the saved note's moyenne supersedes the locally-computed
  // one (saved notes win in the de-dup map). Net result: instant
  // Baromètre, eventually consistent, zero extra reads.
  const closedSavedNotes = useMemo(() => {
    // Index by eleveId, "saved" entries from notesData take priority.
    const out = new Map<string, { eleve: Eleve; moy: number }>()

    // Pass 1: locally-closed rows. Computed inline from the row's
    // interros + devoirs using the same formulas as the engine. Only
    // included when the local row is closed AND has a valid moyenne.
    for (const e of eleves) {
      const r = rows[e.id]
      if (!r || r.estCloture !== true) continue
      const cleanInterros = r.interros.filter((v): v is number => v !== null)
      const mi = computeMI(cleanInterros)
      const mm = computeMM({
        moyenneInterros: mi,
        devoir1: r.devoir1,
        devoir2: r.devoir2,
      })
      if (mm === null || isNaN(mm)) continue
      out.set(e.id, { eleve: e, moy: mm })
    }

    // Pass 2: snapshot-saved closed notes. Overwrites Pass 1 entries
    // when present — the saved moyenne is authoritative because it's
    // what bulletins will pull from.
    for (const nd of notesData) {
      const eleve = eleves.find((e) => e.id === nd.eleveId)
      if (!eleve) continue
      const note = nd.note
      if (note.estCloture !== true) continue
      if (note.abandonne === true) {
        // Explicitly drop abandonné — they shouldn't drag the average
        // even if Pass 1 added them (race window).
        out.delete(nd.eleveId)
        continue
      }
      if (
        note.moyenneMatiere === null ||
        note.moyenneMatiere === undefined ||
        isNaN(note.moyenneMatiere)
      )
        continue
      out.set(nd.eleveId, { eleve, moy: note.moyenneMatiere })
    }

    return Array.from(out.values())
  }, [notesData, eleves, rows])

  const barometre = useMemo(() => {
    if (closedSavedNotes.length === 0) return null
    return calculerBarometre(
      closedSavedNotes.map((x) => ({ nom: x.eleve.nom, moy: x.moy }))
    )
  }, [closedSavedNotes])

  const abandonneCount = useMemo(
    () =>
      notesData.filter((nd) => nd.note.abandonne === true).length,
    [notesData]
  )

  /** Map: eleveId → rank string ("3ème/15"). Empty if not enough data. */
  const rankByEleveId = useMemo(() => {
    const m = new Map<string, RankResult>()
    if (closedSavedNotes.length === 0) return m
    const ranking = computeRanking(
      closedSavedNotes.map((x) => ({
        id: x.eleve.id,
        moyenneGenerale: x.moy,
        genre: x.eleve.genre,
      }))
    )
    for (const r of ranking) m.set(r.id, r)
    return m
  }, [closedSavedNotes])

  if (elevesLoading || notesLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" label="Chargement des notes…" />
      </div>
    )
  }

  if (eleves.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="h-10 w-10" />}
        title="Aucun élève dans cette classe"
        description="Demandez à l'administration d'ajouter des élèves avant de saisir des notes."
      />
    )
  }

  return (
    <div className="space-y-4">
      {allClosed && (
        <div className="rounded-md bg-success-bg border border-success/20 px-4 py-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-success shrink-0" aria-hidden />
          <p className="text-[0.8125rem] text-success">
            <strong>Clôturé.</strong> Cette matière est finalisée pour {periode}.
          </p>
        </div>
      )}

      {/* Baromètre — only when at least some closed data exists */}
      {barometre && (
        <MatiereBarometre
          stats={barometre}
          matiere={matiere}
          periode={periode}
          abandonneCount={abandonneCount}
        />
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-ink-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-ink-50/50 text-ink-400 text-[0.7rem] font-bold uppercase tracking-wider">
              <th className="px-4 py-3 w-8">N°</th>
              <th className="px-4 py-3">Élève</th>
              <th className="px-4 py-3 min-w-[260px]">Interrogations</th>
              <th className="px-2 py-3 w-20 text-center">Dev. 1</th>
              <th className="px-2 py-3 w-20 text-center">Dev. 2</th>
              <th className="px-3 py-3 w-16 text-center bg-ink-50">M.I.</th>
              <th className="px-3 py-3 w-20 text-center bg-info-bg/40">Moy.</th>
              <th className="px-3 py-3 w-20 text-center bg-gold/10">Rang</th>
            </tr>
          </thead>
          <tbody>
            {eleves.map((e, i) => (
              <NoteRow
                key={e.id}
                index={i}
                eleve={e}
                row={rows[e.id] ?? freshRow()}
                status={statuses[e.id] ?? 'idle'}
                rang={rankByEleveId.get(e.id)?.rang}
                onSetInterro={(idx, v) => setInterro(e.id, idx, v)}
                onAddInterro={() => addInterro(e.id)}
                onRemoveInterro={(idx) => removeInterro(e.id, idx)}
                onSetDev={(which, v) => updateRow(e.id, { [which]: v })}
                onGiveColle={() => openColleFor(e.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {eleves.map((e, i) => (
          <MobileNoteRow
            key={e.id}
            index={i}
            eleve={e}
            row={rows[e.id] ?? freshRow()}
            status={statuses[e.id] ?? 'idle'}
            rang={rankByEleveId.get(e.id)?.rang}
            onSetInterro={(idx, v) => setInterro(e.id, idx, v)}
            onAddInterro={() => addInterro(e.id)}
            onRemoveInterro={(idx) => removeInterro(e.id, idx)}
            onSetDev={(which, v) => updateRow(e.id, { [which]: v })}
            onGiveColle={() => openColleFor(e.id)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
        <p className="text-[0.78rem] text-ink-400">
          {allClosed
            ? 'Matière clôturée pour cette période.'
            : `Sauvegarde automatique. ${eleves.length} élève${eleves.length > 1 ? 's' : ''} · ${periode} · ${matiere}`}
        </p>
        {allClosed ? (
          <p className="text-[0.78rem] text-ink-400 italic">
            Pour modifier, demandez au professeur principal de déverrouiller.
          </p>
        ) : (
          <Button
            onClick={openClosureModal}
            loading={closing}
            variant="primary"
            leadingIcon={<Calculator className="h-4 w-4" />}
          >
            {anyClosed ? 'Compléter la clôture' : 'Clôturer'}
          </Button>
        )}
      </div>

      <ModalClosureMatiere
        open={closureModalOpen}
        onClose={() => setClosureModalOpen(false)}
        onReturnToEntry={returnToEntry}
        onConfirm={commitClosure}
        matiere={matiere}
        periode={periode}
        eleves={eleves}
        snapshots={closureSnapshots}
      />

      {colleEleve && (
        <ModalGiveColle
          open={colleOpen}
          onClose={closeColle}
          classeId={classeId}
          eleveId={colleEleve.id}
          eleveName={colleEleve.nom}
          matiere={matiere}
          periode={periode}
        />
      )}
    </div>
  )
}

// ─── Shared row props ────────────────────────────────────────

interface RowProps {
  index: number
  eleve: Eleve
  row: RowState
  status: ReturnType<typeof useDebouncedSave<RowState>>['statuses'][string]
  /** Rank string from per-matière computeRanking; undefined if not enough data */
  rang?: string
  onSetInterro: (idx: number, v: number | null) => void
  onAddInterro: () => void
  onRemoveInterro: (idx: number) => void
  onSetDev: (which: 'devoir1' | 'devoir2', v: number | null) => void
  /** Open the "Donner une colle" modal scoped to this élève */
  onGiveColle: () => void
}

// ─── Desktop row ─────────────────────────────────────────────

function NoteRow({
  index,
  eleve,
  row,
  status,
  rang,
  onSetInterro,
  onAddInterro,
  onRemoveInterro,
  onSetDev,
  onGiveColle,
}: RowProps) {
  const validInterros = row.interros.filter(
    (v): v is number => v !== null
  )
  const mi = computeMI(validInterros)
  const mm = computeMM({
    moyenneInterros: mi,
    devoir1: row.devoir1,
    devoir2: row.devoir2,
  })
  const locked = row.estCloture
  const canRemove = !locked && row.interros.length > MIN_INTERROS
  const canAdd = !locked && row.interros.length < MAX_INTERROS

  return (
    <tr
      id={`note-row-${eleve.id}`}
      className={cn(
        'border-t border-ink-100 transition-colors',
        locked && 'bg-success-bg/20'
      )}
    >
      <td className="px-4 py-2 text-sm text-ink-400 font-mono align-middle">
        {String(index + 1).padStart(2, '0')}
      </td>
      <td className="px-4 py-2 align-middle">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-navy text-[0.875rem]">
            {eleve.nom}
          </span>
          {locked && (
            <Lock className="h-3 w-3 text-success shrink-0" aria-hidden />
          )}
          <button
            type="button"
            onClick={onGiveColle}
            aria-label={`Donner une colle à ${eleve.nom}`}
            title="Donner une colle"
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-danger hover:bg-danger-bg/60 transition-colors !min-h-0 !min-w-0"
          >
            <AlertOctagon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </td>

      {/* Interrogations cluster — horizontal scroll if many */}
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {row.interros.map((val, i) => (
            <div key={i} className="relative shrink-0 w-16 group">
              <NoteCell
                value={val}
                onChange={(v) => onSetInterro(i, v)}
                disabled={locked}
                status={status}
                ariaLabel={`Interrogation ${i + 1} de ${eleve.nom}`}
              />
              {canRemove && (
                <button
                  type="button"
                  onClick={() => onRemoveInterro(i)}
                  aria-label={`Retirer l'interrogation ${i + 1}`}
                  className="absolute -top-1 -right-1 hidden group-hover:inline-flex !h-4 !w-4 !min-h-0 !min-w-0 items-center justify-center rounded-full bg-danger text-white shadow-sm hover:bg-danger/80 transition-colors p-0"
                >
                  <X className="h-2.5 w-2.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={onAddInterro}
              aria-label="Ajouter une interrogation"
              className="shrink-0 inline-flex !h-8 !w-8 !min-h-0 !min-w-0 items-center justify-center rounded-md border border-dashed border-ink-200 text-ink-400 hover:border-navy hover:text-navy transition-colors"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </td>

      <td className="px-1 py-1.5 align-middle">
        <NoteCell
          value={row.devoir1}
          onChange={(v) => onSetDev('devoir1', v)}
          disabled={locked}
          status={status}
          ariaLabel={`Devoir 1 de ${eleve.nom}`}
        />
      </td>
      <td className="px-1 py-1.5 align-middle">
        <NoteCell
          value={row.devoir2}
          onChange={(v) => onSetDev('devoir2', v)}
          disabled={locked}
          status={status}
          ariaLabel={`Devoir 2 de ${eleve.nom}`}
        />
      </td>
      <td className="px-3 py-2 text-center text-sm font-mono tabular-nums bg-ink-50/50 text-ink-600 align-middle">
        {fmt(mi)}
      </td>
      <td className="px-3 py-2 text-center text-sm font-mono tabular-nums font-bold bg-info-bg/30 align-middle">
        {mm === null || isNaN(mm) ? (
          <span className="text-ink-400">—</span>
        ) : (
          <span className={mm >= 10 ? 'text-success' : 'text-danger'}>
            {mm.toFixed(2)}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-center text-[0.78rem] tabular-nums bg-gold/5 align-middle">
        {rang ? (
          <span className="font-semibold text-navy">{rang}</span>
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
    </tr>
  )
}

// ─── Mobile row ──────────────────────────────────────────────

function MobileNoteRow({
  index,
  eleve,
  row,
  status,
  rang,
  onSetInterro,
  onAddInterro,
  onRemoveInterro,
  onSetDev,
  onGiveColle,
}: RowProps) {
  const validInterros = row.interros.filter(
    (v): v is number => v !== null
  )
  const mi = computeMI(validInterros)
  const mm = computeMM({
    moyenneInterros: mi,
    devoir1: row.devoir1,
    devoir2: row.devoir2,
  })
  const locked = row.estCloture
  const canRemove = !locked && row.interros.length > MIN_INTERROS
  const canAdd = !locked && row.interros.length < MAX_INTERROS
  const moyenneDisplay = mm === null || isNaN(mm) ? null : mm

  return (
    <div
      id={`note-row-${eleve.id}`}
      className={cn(
        'rounded-lg border-[1.5px] bg-white p-3',
        locked ? 'border-success/30 bg-success-bg/10' : 'border-ink-100'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.7rem] font-bold text-ink-400 font-mono">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="font-semibold text-navy text-[0.875rem] truncate">
            {eleve.nom}
          </span>
          {locked && <Lock className="h-3 w-3 text-success shrink-0" aria-hidden />}
          <button
            type="button"
            onClick={onGiveColle}
            aria-label={`Donner une colle à ${eleve.nom}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-danger active:bg-danger-bg/60 transition-colors !min-h-0 !min-w-0 shrink-0"
          >
            <AlertOctagon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="text-right">
          <p className="text-[0.65rem] uppercase tracking-wider text-ink-400 font-bold">
            Moyenne
          </p>
          <p
            className={cn(
              'font-mono font-bold tabular-nums text-base',
              moyenneDisplay === null
                ? 'text-ink-400'
                : moyenneDisplay >= 10
                  ? 'text-success'
                  : 'text-danger'
            )}
          >
            {moyenneDisplay === null ? '—' : moyenneDisplay.toFixed(2)}
          </p>
          {rang && (
            <p className="text-[0.65rem] text-navy/70 font-semibold tabular-nums mt-0.5">
              {rang}
            </p>
          )}
        </div>
      </div>

      {/* Interros — variable count, wraps */}
      <div className="mb-3">
        <p className="text-[0.65rem] uppercase tracking-wider text-ink-400 font-bold mb-1.5">
          Interrogations
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {row.interros.map((val, i) => (
            <div key={i} className="relative w-[60px] group">
              <NoteCell
                value={val}
                onChange={(v) => onSetInterro(i, v)}
                disabled={locked}
                status={status}
                ariaLabel={`Interrogation ${i + 1} de ${eleve.nom}`}
              />
              {canRemove && (
                <button
                  type="button"
                  onClick={() => onRemoveInterro(i)}
                  aria-label={`Retirer l'interrogation ${i + 1}`}
                  className="absolute -top-1 -right-1 inline-flex !h-4 !w-4 !min-h-0 !min-w-0 items-center justify-center rounded-full bg-danger text-white shadow-sm hover:bg-danger/80 transition-colors p-0"
                >
                  <X className="h-2.5 w-2.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {canAdd && (
            <IconButton
              variant="ghost"
              aria-label="Ajouter une interrogation"
              onClick={onAddInterro}
              className="h-8 w-8 border border-dashed border-ink-200 text-ink-400"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
          )}
        </div>
      </div>

      {/* Devoirs + M.I. */}
      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="block text-[0.65rem] uppercase tracking-wider text-ink-400 font-bold mb-1 text-center">
            Dev. 1
          </label>
          <NoteCell
            value={row.devoir1}
            onChange={(v) => onSetDev('devoir1', v)}
            disabled={locked}
            status={status}
            ariaLabel={`Devoir 1 de ${eleve.nom}`}
          />
        </div>
        <div>
          <label className="block text-[0.65rem] uppercase tracking-wider text-ink-400 font-bold mb-1 text-center">
            Dev. 2
          </label>
          <NoteCell
            value={row.devoir2}
            onChange={(v) => onSetDev('devoir2', v)}
            disabled={locked}
            status={status}
            ariaLabel={`Devoir 2 de ${eleve.nom}`}
          />
        </div>
        <div>
          <label className="block text-[0.65rem] uppercase tracking-wider text-ink-400 font-bold mb-1 text-center">
            M.I.
          </label>
          <div className="text-center px-2 py-1.5 rounded-md bg-ink-50 text-ink-600 font-mono tabular-nums text-[0.875rem]">
            {fmt(mi)}
          </div>
        </div>
      </div>
    </div>
  )
}
