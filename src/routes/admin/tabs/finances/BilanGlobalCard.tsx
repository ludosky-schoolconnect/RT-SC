/**
 * RT-SC · Bilan global card.
 *
 * School-wide finance summary:
 *   - Total encaissé (sum of all paiements across all élèves)
 *   - Total cible théorique (sum of cibles given current config)
 *   - Taux de recouvrement
 *   - Top retards (élèves with the largest gap between cible and paid)
 *
 * Computing this is expensive — it requires fetching the paiements
 * subcollection for EVERY élève. For a school of 500 élèves that's
 * 500 reads. To avoid hammering Firestore on every visit, we don't
 * compute on mount: admin clicks "Calculer le bilan" to opt in, and
 * the result stays cached until a new paiement is added (then admin
 * can re-click).
 *
 * For each computation: parallelizes paiement fetches in chunks of
 * 10 to stay under Firestore's per-second connection limits. A
 * spinner + progress count keeps admin informed.
 */

import { useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, ArrowUpDown, Calculator, ListOrdered, TrendingDown } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { useToast } from '@/stores/toast'
import { useAllEleves } from '@/hooks/useAllEleves'
import { useClasses } from '@/hooks/useClasses'
import { useFinancesConfig, calculerCible, getEtatPaiement } from '@/hooks/useFinances'
import { paiementsCol } from '@/lib/firestore-keys'
import { formatFCFA } from '@/hooks/usePaiements'
import { nomClasse } from '@/lib/benin'
import { serverNow } from '@/lib/serverTime'

interface BilanRow {
  eleveId: string
  classeId: string
  nom: string
  classeName: string
  paye: number
  cible: number
  reste: number
}

interface Bilan {
  totalEncaisse: number
  totalCible: number
  totalReste: number
  nbSolde: number
  nbPartiel: number
  nbAucun: number
  topRetards: BilanRow[]
  /**
   * Full row list — only populated for per-class scope (where row count
   * is bounded and a sortable table is useful). For global scope this
   * stays `undefined` to avoid holding 500+ rows in memory.
   */
  allRows?: BilanRow[]
  computedAt: Date
}

const PARALLEL_CHUNK = 10

async function computeBilan(
  eleves: ReturnType<typeof useAllEleves>['data'] extends infer T
    ? T extends Array<infer U> ? U[] : never
    : never,
  classesById: Map<string, { label: string; niveau?: string }>,
  cfg: import('@/types/models').FinancesConfig,
  onProgress: (done: number, total: number) => void,
  retainAll = false
): Promise<Bilan> {
  const rows: BilanRow[] = []
  let totalEncaisse = 0
  let totalCible = 0

  let done = 0
  const total = eleves.length

  // Process in chunks to avoid spawning 500 fetches at once
  for (let i = 0; i < eleves.length; i += PARALLEL_CHUNK) {
    const chunk = eleves.slice(i, i + PARALLEL_CHUNK)
    const results = await Promise.allSettled(
      chunk.map(async (e) => {
        const meta = classesById.get(e.classeId)
        const cible = calculerCible(e.genre, meta?.niveau, cfg)
        const snap = await getDocs(collection(db, paiementsCol(e.classeId, e.id)))
        let paye = 0
        snap.forEach((d) => {
          const data = d.data() as { montant?: number }
          paye += Number(data.montant) || 0
        })
        return {
          eleveId: e.id,
          classeId: e.classeId,
          nom: e.nom ?? 'Sans nom',
          classeName: meta?.label ?? '—',
          paye,
          cible,
          reste: Math.max(0, cible - paye),
        }
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        rows.push(r.value)
        totalEncaisse += r.value.paye
        totalCible += r.value.cible
      }
      done++
    }
    onProgress(done, total)
  }

  // Categorize using the centralized helper so terminology stays in sync.
  let nbAucun = 0
  let nbPartiel = 0
  let nbSolde = 0
  for (const r of rows) {
    if (r.cible === 0) continue
    const { etat } = getEtatPaiement(r.paye, r.cible)
    if (etat === 'solde') nbSolde++
    else if (etat === 'partiel') nbPartiel++
    else nbAucun++
  }

  // Top retards: highest reste, only those who actually owe
  const topRetards = rows
    .filter((r) => r.reste > 0)
    .sort((a, b) => b.reste - a.reste)
    .slice(0, 10)

  return {
    totalEncaisse,
    totalCible,
    totalReste: Math.max(0, totalCible - totalEncaisse),
    nbSolde,
    nbPartiel,
    nbAucun,
    topRetards,
    ...(retainAll
      ? { allRows: [...rows].sort((a, b) => a.nom.localeCompare(b.nom)) }
      : {}),
    computedAt: serverNow(),
  }
}

// ─── CSV / PDF export ─────────────────────────────────────────

function exportBilanCSV(bilan: Bilan, ecoleNom?: string, scopeLabel?: string) {
  const lines: string[] = []
  const csv = (s: string | number | null | undefined) => {
    if (s == null) return ''
    const str = String(s)
    if (/[",\r\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
    return str
  }
  const title = scopeLabel
    ? `Bilan financier — ${scopeLabel}`
    : 'Bilan financier global'
  lines.push(csv(title))
  if (ecoleNom) lines.push(`${csv('École')},${csv(ecoleNom)}`)
  lines.push(`${csv('Calculé le')},${csv(bilan.computedAt.toLocaleString('fr-FR'))}`)
  lines.push('')
  lines.push(csv('Synthèse'))
  lines.push(`${csv('Total encaissé')},${csv(bilan.totalEncaisse)}`)
  lines.push(`${csv('Total cible')},${csv(bilan.totalCible)}`)
  lines.push(`${csv('Reste à recouvrer')},${csv(bilan.totalReste)}`)
  lines.push(`${csv('Élèves soldés')},${csv(bilan.nbSolde)}`)
  lines.push(`${csv('Élèves en paiement partiel')},${csv(bilan.nbPartiel)}`)
  lines.push(`${csv('Élèves sans paiement')},${csv(bilan.nbAucun)}`)
  lines.push('')
  // When we have the full roster (per-class scope), export every élève
  // sorted by nom. Otherwise fall back to top retards list.
  if (bilan.allRows && bilan.allRows.length > 0) {
    lines.push(csv('Liste complète'))
    lines.push(['Élève', 'Classe', 'Cible', 'Versé', 'Reste', 'État'].map(csv).join(','))
    for (const r of bilan.allRows) {
      const etat =
        r.cible === 0
          ? '—'
          : getEtatPaiement(r.paye, r.cible).label
      lines.push(
        [r.nom, r.classeName, r.cible, r.paye, r.reste, etat].map(csv).join(',')
      )
    }
  } else {
    lines.push(csv('Top retards'))
    lines.push(['Élève', 'Classe', 'Cible', 'Versé', 'Reste'].map(csv).join(','))
    for (const r of bilan.topRetards) {
      lines.push(
        [r.nom, r.classeName, r.cible, r.paye, r.reste].map(csv).join(',')
      )
    }
  }
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const d = bilan.computedAt
  const pad = (n: number) => String(n).padStart(2, '0')
  const scopeSlug = scopeLabel
    ? '-' + scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : ''
  a.download = `bilan-finances${scopeSlug}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

async function exportBilanPDF(bilan: Bilan, ecoleNom?: string, scopeLabel?: string) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const navy: [number, number, number] = [11, 37, 69]

  doc.setFillColor(...navy)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 60, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(ecoleNom || 'Établissement scolaire', 40, 24)
  doc.setFontSize(11)
  const pdfTitle = scopeLabel
    ? `Bilan financier — ${scopeLabel}`
    : 'Bilan financier global'
  doc.text(pdfTitle, 40, 44)

  let y = 90
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 102, 122)
  doc.text(`Calculé le ${bilan.computedAt.toLocaleString('fr-FR')}`, 40, y)
  y += 20

  autoTable(doc, {
    startY: y,
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Total encaissé', formatFCFA(bilan.totalEncaisse)],
      ['Total cible', formatFCFA(bilan.totalCible)],
      ['Reste à recouvrer', formatFCFA(bilan.totalReste)],
      ['Élèves soldés', String(bilan.nbSolde)],
      ['Élèves en paiement partiel', String(bilan.nbPartiel)],
      ['Élèves sans paiement', String(bilan.nbAucun)],
    ],
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 40, right: 40 },
  })

  const last = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
  y = last.finalY + 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...navy)

  if (bilan.allRows && bilan.allRows.length > 0) {
    // Per-class scope — full roster with état column, sorted by nom
    doc.text('Liste complète', 40, y)
    y += 6
    autoTable(doc, {
      startY: y,
      head: [['Élève', 'Cible', 'Versé', 'Reste', 'État']],
      body: bilan.allRows.map((r) => {
        const etat =
          r.cible === 0 ? '—' : getEtatPaiement(r.paye, r.cible).label
        return [
          r.nom,
          formatFCFA(r.cible),
          formatFCFA(r.paye),
          formatFCFA(r.reste),
          etat,
        ]
      }),
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      margin: { left: 40, right: 40 },
    })
  } else {
    doc.text('Top retards', 40, y)
    y += 6
    autoTable(doc, {
      startY: y,
      head: [['Élève', 'Classe', 'Cible', 'Versé', 'Reste']],
      body: bilan.topRetards.length
        ? bilan.topRetards.map((r) => [
            r.nom,
            r.classeName,
            formatFCFA(r.cible),
            formatFCFA(r.paye),
            formatFCFA(r.reste),
          ])
        : [['—', '—', '—', '—', '—']],
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      margin: { left: 40, right: 40 },
    })
  }

  const d = bilan.computedAt
  const pad = (n: number) => String(n).padStart(2, '0')
  const scopeSlug = scopeLabel
    ? '-' + scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : ''
  doc.save(
    `bilan-finances${scopeSlug}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`
  )
}

// ─── Component ────────────────────────────────────────────────

type Scope = 'global' | 'classe'

export function BilanGlobalCard() {
  const { data: eleves = [], isLoading: loadingEleves } = useAllEleves()
  const { data: classes = [] } = useClasses()
  const { data: cfg } = useFinancesConfig()
  const toast = useToast()

  const [scope, setScope] = useState<Scope>('global')
  const [classeId, setClasseId] = useState<string>('')
  const [bilan, setBilan] = useState<Bilan | null>(null)
  const [bilanScopeLabel, setBilanScopeLabel] = useState<string | undefined>(undefined)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [computing, setComputing] = useState(false)

  // Sort classes for the picker by niveau + salle for readable ordering.
  const sortedClasses = [...classes].sort((a, b) => {
    const la = nomClasse(a)
    const lb = nomClasse(b)
    return la.localeCompare(lb)
  })

  // Invalidate cached bilan when the user flips the toggle or changes class,
  // so the on-screen result can't mismatch the current scope.
  function changeScope(next: Scope) {
    setScope(next)
    setBilan(null)
    setBilanScopeLabel(undefined)
    if (next === 'global') setClasseId('')
  }

  function changeClasse(nextId: string) {
    setClasseId(nextId)
    setBilan(null)
    setBilanScopeLabel(undefined)
  }

  async function compute() {
    if (!cfg) {
      toast.error('Configuration introuvable.')
      return
    }

    // Build the eleves + scopeLabel inputs based on scope.
    let targetEleves = eleves
    let scopeLabel: string | undefined = undefined

    if (scope === 'classe') {
      if (!classeId) {
        toast.error('Sélectionnez une classe.')
        return
      }
      targetEleves = eleves.filter((e) => e.classeId === classeId)
      const c = classes.find((x) => x.id === classeId)
      scopeLabel = c ? nomClasse(c) : 'Classe'
    }

    if (targetEleves.length === 0) {
      toast.error(
        scope === 'classe'
          ? 'Cette classe n\'a aucun élève.'
          : 'Aucun élève à analyser.'
      )
      return
    }

    const classesById = new Map<string, { label: string; niveau?: string }>()
    for (const c of classes) classesById.set(c.id, { label: nomClasse(c), niveau: c.niveau })

    setComputing(true)
    setProgress({ done: 0, total: targetEleves.length })
    try {
      const result = await computeBilan(
        targetEleves,
        classesById,
        cfg,
        (done, total) => setProgress({ done, total }),
        scope === 'classe'  // retainAll — only for per-class scope
      )
      setBilan(result)
      setBilanScopeLabel(scopeLabel)
      toast.success(
        scopeLabel
          ? `Bilan ${scopeLabel} calculé sur ${targetEleves.length} élèves.`
          : `Bilan calculé sur ${targetEleves.length} élèves.`
      )
    } catch (err) {
      console.error('[bilan] error:', err)
      toast.error('Échec du calcul du bilan.')
    } finally {
      setComputing(false)
    }
  }

  const tauxRecouvrement =
    bilan && bilan.totalCible > 0
      ? Math.round((bilan.totalEncaisse / bilan.totalCible) * 100)
      : 0

  const canCompute =
    !computing &&
    !loadingEleves &&
    eleves.length > 0 &&
    (scope === 'global' || !!classeId)

  return (
    <div>
      <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
        Bilan
      </p>

      <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-sm">
        {/* Scope switcher */}
        <div className="inline-flex items-center gap-1 rounded-md bg-ink-50/60 p-1 mb-3 border border-ink-100">
          <ScopeBtn
            active={scope === 'global'}
            label="Global"
            onClick={() => changeScope('global')}
          />
          <ScopeBtn
            active={scope === 'classe'}
            label="Par classe"
            onClick={() => changeScope('classe')}
          />
        </div>

        {/* Class picker — visible only when scope is 'classe' */}
        {scope === 'classe' && (
          <div className="mb-3">
            <label className="block text-[0.72rem] font-semibold text-ink-600 mb-1">
              Sélectionner une classe
            </label>
            <select
              value={classeId}
              onChange={(e) => changeClasse(e.target.value)}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[0.85rem] font-medium text-ink-800 focus:outline-none focus:ring-2 focus:ring-navy/30 min-h-touch"
            >
              <option value="">— Choisir une classe —</option>
              {sortedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomClasse(c)}
                </option>
              ))}
            </select>
          </div>
        )}

        {!bilan ? (
          <div className="text-center py-4">
            <Activity className="h-9 w-9 text-ink-300 mx-auto mb-2" aria-hidden />
            <p className="text-[0.85rem] text-ink-600 mb-3">
              {scope === 'global'
                ? 'Calculer le total encaissé, le taux de recouvrement et identifier les retards pour toute l\'école.'
                : classeId
                  ? 'Calculer les indicateurs financiers uniquement pour la classe sélectionnée.'
                  : 'Choisissez une classe pour calculer son bilan.'}
            </p>
            <Button
              onClick={compute}
              disabled={!canCompute}
              loading={computing}
              leadingIcon={<Calculator className="h-4 w-4" />}
            >
              {computing
                ? `Calcul… ${progress.done}/${progress.total}`
                : 'Calculer le bilan'}
            </Button>
          </div>
        ) : (
          <BilanResult
            bilan={bilan}
            scopeLabel={bilanScopeLabel}
            tauxRecouvrement={tauxRecouvrement}
            recompute={compute}
            recomputing={computing}
            progress={progress}
          />
        )}
      </div>
    </div>
  )
}

// Scope toggle button — matches the InscriptionPage tabs style
function ScopeBtn({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-md px-3 py-1.5 text-[0.78rem] font-semibold transition-all min-h-touch',
        active ? 'bg-navy text-white shadow-sm' : 'text-ink-600 hover:text-navy',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function BilanResult({
  bilan,
  scopeLabel,
  tauxRecouvrement,
  recompute,
  recomputing,
  progress,
}: {
  bilan: Bilan
  scopeLabel?: string
  tauxRecouvrement: number
  recompute: () => void
  recomputing: boolean
  progress: { done: number; total: number }
}) {
  return (
    <div className="space-y-4">
      {/* Scope heading — tells the user which view of the numbers
          they're looking at (global vs a specific class). */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[0.78rem] font-semibold text-ink-700">
          {scopeLabel ? (
            <>
              <span className="text-ink-500">Classe : </span>
              <span className="text-navy font-bold">{scopeLabel}</span>
            </>
          ) : (
            <span className="text-navy font-bold">Ensemble de l'école</span>
          )}
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Tile
          label="Encaissé"
          value={formatFCFA(bilan.totalEncaisse)}
          tone="success"
        />
        <Tile
          label="Cible totale"
          value={formatFCFA(bilan.totalCible)}
          tone="navy"
        />
        <Tile
          label="Reste à recouvrer"
          value={formatFCFA(bilan.totalReste)}
          tone={bilan.totalReste > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* Recouvrement bar */}
      <div>
        <div className="flex items-center justify-between text-[0.78rem] mb-1">
          <span className="font-semibold text-ink-700">Taux de recouvrement</span>
          <span className="font-mono font-bold text-navy">{tauxRecouvrement}%</span>
        </div>
        <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
          <div
            className="h-full bg-success transition-all duration-300"
            style={{ width: `${Math.min(100, tauxRecouvrement)}%` }}
          />
        </div>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-2 flex-wrap text-[0.78rem]">
        <Badge variant="success" size="sm">{bilan.nbSolde} soldés</Badge>
        <Badge variant="warning" size="sm">{bilan.nbPartiel} paiement partiel</Badge>
        <Badge variant="danger" size="sm">{bilan.nbAucun} aucun paiement</Badge>
      </div>

      {/* Top retards — hidden when we have the full sortable table
          (per-class scope); the table already exposes all retards
          plus everyone else. */}
      {bilan.topRetards.length > 0 && !bilan.allRows && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-danger" aria-hidden />
            <p className="text-[0.78rem] font-semibold text-ink-700">
              Top {bilan.topRetards.length} retards
            </p>
          </div>
          <div className="rounded-md border border-ink-100 divide-y divide-ink-100 max-h-60 overflow-y-auto">
            {bilan.topRetards.map((r) => (
              <div
                key={`${r.classeId}-${r.eleveId}`}
                className="flex items-center justify-between gap-2 px-3 py-2 text-[0.8rem]"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-ink-800 truncate">{r.nom}</div>
                  <div className="text-[0.7rem] text-ink-500 truncate">{r.classeName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-danger text-[0.82rem]">
                    {formatFCFA(r.reste)}
                  </div>
                  <div className="text-[0.66rem] text-ink-400">
                    versé : {formatFCFA(r.paye)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full class roster (per-class scope only) — sortable on every
          column. Useful to see the entire class at a glance, not just
          the top retards. */}
      {bilan.allRows && bilan.allRows.length > 0 && (
        <BilanClassTable rows={bilan.allRows} />
      )}

      {/* Footer: recompute + export */}
      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <p className="text-[0.7rem] text-ink-400">
          Calculé le {bilan.computedAt.toLocaleString('fr-FR')}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={recompute}
            disabled={recomputing}
            loading={recomputing}
            leadingIcon={<Calculator className="h-3.5 w-3.5" />}
          >
            {recomputing ? `${progress.done}/${progress.total}` : 'Recalculer'}
          </Button>
          <ExportMenu
            countLabel={scopeLabel ? `Bilan ${scopeLabel}` : 'Bilan financier'}
            onCsv={() => exportBilanCSV(bilan, undefined, scopeLabel)}
            onPdf={() => exportBilanPDF(bilan, undefined, scopeLabel)}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Per-class sortable table ─────────────────────────────────

type SortKey = 'nom' | 'paye' | 'cible' | 'reste' | 'etat'
type SortDir = 'asc' | 'desc'

/**
 * Renders the full class roster with sortable columns. Only mounted
 * when `bilan.allRows` is populated (per-class scope). Click a header
 * to flip sort direction for that column; clicking another header
 * moves the sort target.
 *
 * All sort work is done in-memory (class rosters are bounded — 30-50
 * rows typical). No Firestore re-reads.
 */
function BilanClassTable({ rows }: { rows: BilanRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('nom')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'nom') {
        cmp = (a.nom ?? '').localeCompare(b.nom ?? '')
      } else if (sortKey === 'paye') {
        cmp = a.paye - b.paye
      } else if (sortKey === 'cible') {
        cmp = a.cible - b.cible
      } else if (sortKey === 'reste') {
        cmp = a.reste - b.reste
      } else if (sortKey === 'etat') {
        // Sort order: solde < partiel < aucun (green first, red last)
        const rank = (r: BilanRow) => {
          if (r.cible === 0) return 99
          const { etat } = getEtatPaiement(r.paye, r.cible)
          return etat === 'solde' ? 0 : etat === 'partiel' ? 1 : 2
        }
        cmp = rank(a) - rank(b)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'nom' ? 'asc' : 'desc')  // amounts: biggest first by default
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <ListOrdered className="h-3.5 w-3.5 text-navy" aria-hidden />
        <p className="text-[0.78rem] font-semibold text-ink-700">
          Liste complète ({rows.length} élèves) — cliquez pour trier
        </p>
      </div>
      <div className="rounded-md border border-ink-100 overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1.8fr_1fr_1fr_0.9fr] gap-1 bg-ink-50/60 border-b border-ink-100 px-2 py-1.5 text-[0.68rem] uppercase font-bold tracking-wider text-ink-600">
          <SortHeader
            label="Élève"
            active={sortKey === 'nom'}
            dir={sortDir}
            onClick={() => toggleSort('nom')}
          />
          <SortHeader
            label="Versé"
            active={sortKey === 'paye'}
            dir={sortDir}
            onClick={() => toggleSort('paye')}
            align="right"
          />
          <SortHeader
            label="Reste"
            active={sortKey === 'reste'}
            dir={sortDir}
            onClick={() => toggleSort('reste')}
            align="right"
          />
          <SortHeader
            label="État"
            active={sortKey === 'etat'}
            dir={sortDir}
            onClick={() => toggleSort('etat')}
            align="right"
          />
        </div>
        {/* Body */}
        <div className="divide-y divide-ink-100 max-h-80 overflow-y-auto">
          {sorted.map((r) => {
            const etatInfo =
              r.cible > 0
                ? getEtatPaiement(r.paye, r.cible)
                : { label: '—', variant: 'neutral' as const }
            return (
              <div
                key={`${r.classeId}-${r.eleveId}`}
                className="grid grid-cols-[1.8fr_1fr_1fr_0.9fr] gap-1 px-2 py-2 text-[0.78rem] items-center"
              >
                <div className="min-w-0 font-semibold text-ink-800 truncate">
                  {r.nom}
                </div>
                <div className="text-right font-mono text-ink-700">
                  {formatFCFA(r.paye)}
                </div>
                <div
                  className={`text-right font-mono font-semibold ${
                    r.reste > 0 ? 'text-danger' : 'text-ink-500'
                  }`}
                >
                  {formatFCFA(r.reste)}
                </div>
                <div className="flex justify-end">
                  <Badge variant={etatInfo.variant} size="sm">
                    {etatInfo.label === 'Aucun paiement'
                      ? 'Aucun'
                      : etatInfo.label === 'Paiement partiel'
                        ? 'Partiel'
                        : etatInfo.label}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SortHeader({
  label,
  active,
  dir,
  align = 'left',
  onClick,
}: {
  label: string
  active: boolean
  dir: SortDir
  align?: 'left' | 'right'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 min-h-[32px] ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } ${active ? 'text-navy' : 'text-ink-500 hover:text-navy'}`}
    >
      <span>{label}</span>
      {active ? (
        dir === 'asc' ? (
          <ArrowUp className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
      )}
    </button>
  )
}

// ─── Tile ─────────────────────────────────────────────────────

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'navy' | 'danger' | 'neutral'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'navy'
        ? 'text-navy'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-ink-500'
  return (
    <div className="rounded-md bg-ink-50/60 ring-1 ring-ink-100 p-3 text-center">
      <p className="text-[0.66rem] uppercase tracking-widest text-ink-400 font-bold mb-1">
        {label}
      </p>
      <p className={`font-mono font-bold text-[0.95rem] ${toneClass}`}>{value}</p>
    </div>
  )
}
