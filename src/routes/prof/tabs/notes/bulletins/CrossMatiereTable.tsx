/**
 * RT-SC · Cross-matière table for one (class × period).
 *
 * Rows = élèves, columns = matières (filtered to those with coefficients
 * for this class's niveau/série). Each cell shows the moyenne or a state
 * indicator.
 *
 * Cell states:
 *   - Closed, normal     → moyenne in green (≥10) or red (<10)
 *   - Closed, abandonné  → "—" with small "Abs." badge
 *   - Closed, no moyenne → "—" in muted gray (data was empty)
 *   - Not yet closed     → "·" in light gray
 *   - No coefficient     → cell hidden (matière not used at this niveau)
 *   - Layer B outlier    → soft warning chip near the row
 *
 * Sticky first column (élève name) for horizontal scroll usability.
 *
 * Layer B outlier flag is shown on the élève's name (warning icon).
 */

import { useMemo } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Info,
  Lock,
  Minus,
  TrendingDown,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import type {
  CoefficientsDoc,
  Eleve,
  Note,
} from '@/types/models'

const CONDUITE_KEY = 'Conduite'

interface CrossMatiereTableProps {
  eleves: Eleve[]
  /** Indexed [matiere][eleveId] */
  notesByMatiereByEleve: Record<string, Record<string, Note & { id: string }>>
  coefficients: CoefficientsDoc
  /** Élève IDs flagged by Layer B as outliers */
  outlierEleveIds: string[]
  /** Map: eleveId → bulletin doc id present (string) | undefined */
  bulletinByEleve: Record<string, true>
  /** Optional: callback when PP clicks an élève's "Bull. OK" cell */
  onOpenBulletin?: (eleveId: string) => void
}

export function CrossMatiereTable({
  eleves,
  notesByMatiereByEleve,
  coefficients,
  outlierEleveIds,
  bulletinByEleve,
  onOpenBulletin,
}: CrossMatiereTableProps) {
  // Matières to display = keys in coefficients except Conduite
  const matieres = useMemo(
    () =>
      Object.keys(coefficients)
        .filter((m) => m !== CONDUITE_KEY && coefficients[m] > 0)
        .sort((a, b) => a.localeCompare(b, 'fr')),
    [coefficients]
  )

  const outlierSet = useMemo(() => new Set(outlierEleveIds), [outlierEleveIds])

  if (matieres.length === 0) {
    return (
      <div className="rounded-md bg-warning-bg/50 border border-warning/30 px-4 py-3 flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden />
        <p className="text-[0.8125rem] text-warning leading-snug">
          Aucun coefficient configuré pour ce niveau. Demandez à l'administration
          de définir les matières et leurs coefficients dans Année → Coefficients.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
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
                {matieres.map((m) => (
                  <th
                    key={m}
                    className="px-2 py-2 text-center min-w-[68px] whitespace-nowrap"
                    scope="col"
                    title={`Coefficient ${coefficients[m]}`}
                  >
                    <div>{m}</div>
                    <div className="font-normal text-ink-300 normal-case mt-0.5">
                      coef {coefficients[m]}
                    </div>
                  </th>
                ))}
                <th
                  className="px-3 py-2 text-center bg-info-bg/30 border-l border-ink-100 min-w-[80px]"
                  scope="col"
                >
                  Bull.
                </th>
              </tr>
            </thead>
            <tbody>
              {eleves.map((eleve, idx) => {
                const isOutlier = outlierSet.has(eleve.id)
                const hasBulletin = !!bulletinByEleve[eleve.id]
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
                        <span className="font-semibold text-navy text-[0.8125rem] truncate">
                          {eleve.nom}
                        </span>
                        {isOutlier && (
                          <span
                            title="Cet élève a moins de notes que la majorité de la classe — vérifiez."
                            className="shrink-0"
                          >
                            <TrendingDown className="h-3.5 w-3.5 text-warning" aria-hidden />
                          </span>
                        )}
                      </div>
                    </td>
                    {matieres.map((m) => {
                      const note = notesByMatiereByEleve[m]?.[eleve.id]
                      return (
                        <td key={m} className="px-1 py-1 text-center align-middle">
                          <Cell note={note} />
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center bg-info-bg/20 border-l border-ink-100 align-middle">
                      {hasBulletin ? (
                        onOpenBulletin ? (
                          <button
                            type="button"
                            onClick={() => onOpenBulletin(eleve.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-success-bg/70 hover:bg-success-bg px-2 py-0.5 transition-colors !min-h-0 !min-w-0"
                            aria-label={`Voir le bulletin de ${eleve.nom}`}
                          >
                            <Lock className="h-3 w-3 text-success" aria-hidden />
                            <span className="text-success text-[0.65rem] font-bold uppercase tracking-wider">
                              Voir
                            </span>
                          </button>
                        ) : (
                          <Badge variant="success" size="sm" leadingIcon={<Lock className="h-3 w-3" />}>
                            OK
                          </Badge>
                        )
                      ) : (
                        <span className="text-ink-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-ink-400 px-1">
        <LegendItem icon={<CheckCircle2 className="h-3 w-3 text-success" />} label="Clôturée" />
        <LegendItem icon={<Circle className="h-3 w-3 text-ink-300" />} label="Non clôturée" />
        <LegendItem icon={<Minus className="h-3 w-3 text-ink-400" />} label="Aucune note" />
        <LegendItem icon={<Info className="h-3 w-3 text-warning" />} label="Absent (abandon)" />
        <LegendItem icon={<TrendingDown className="h-3 w-3 text-warning" />} label="À vérifier — moins de notes" />
      </div>
    </div>
  )
}

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      <span>{label}</span>
    </span>
  )
}

// ─── Cell ────────────────────────────────────────────────────

function Cell({ note }: { note: (Note & { id: string }) | undefined }) {
  if (!note) {
    return (
      <span
        className="inline-block min-w-[44px] py-0.5 text-ink-300"
        title="Pas encore clôturée"
      >
        ·
      </span>
    )
  }
  if (note.abandonne === true) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning-bg/50 text-warning text-[0.7rem] font-bold"
        title="Élève absent à cette matière sur cette période"
      >
        Abs.
      </span>
    )
  }
  if (note.estCloture !== true) {
    return (
      <span
        className="inline-block min-w-[44px] text-ink-300"
        title="Pas encore clôturée"
      >
        ·
      </span>
    )
  }
  const mm = note.moyenneMatiere
  if (mm === null || mm === undefined || isNaN(mm)) {
    return (
      <span className="text-ink-400 font-mono text-[0.78rem]" title="Clôturée mais aucune note saisie">
        —
      </span>
    )
  }
  return (
    <span
      className={cn(
        'font-mono tabular-nums text-[0.78rem] font-semibold',
        mm >= 10 ? 'text-success' : 'text-danger'
      )}
    >
      {mm.toFixed(2)}
    </span>
  )
}
