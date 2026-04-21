/**
 * RT-SC · Year archive — single élève detail.
 *
 * Shows all of that élève's records for the given archived year:
 *   - Bulletins (per period + année finale)
 *   - Notes (grouped by matière)
 *   - Absences (declared absences from that year)
 *   - Paiements (scolarité tracking)
 *   - Colles (disciplinary hours)
 *
 * Read-only. Four-tab layout (Bulletins · Notes · Absences ·
 * Paiements) because showing everything unfolded would be too dense.
 *
 * The identité card at the top is always visible. Tab content changes
 * below.
 */

import { useMemo, useState } from 'react'
import {
  BadgeCheck, BookOpen, CalendarOff, ClipboardList, CreditCard,
  Mail, MapPin, Phone, Ruler,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { cn } from '@/lib/cn'
import {
  useArchivedEleve,
  useArchivedEleveSub,
} from '@/hooks/useYearArchive'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'
import {
  exportTranscriptCSV,
  exportTranscriptPDF,
} from '@/lib/transcript-export'
import type { Timestamp } from 'firebase/firestore'

interface Props {
  annee: string
  classeId: string
  eleveId: string
  eleveNom: string
  classeNom: string
}

type Tab = 'bulletins' | 'notes' | 'absences' | 'paiements'

export function EleveDetail({ annee, classeId, eleveId, eleveNom, classeNom }: Props) {
  const { data: eleve, isLoading: loadingEleve } = useArchivedEleve(
    annee,
    classeId,
    eleveId
  )

  // Lifted: bulletins + notes fetched here so the export button can use
  // them. React Query's cache means the tab children re-read these
  // without refetching.
  const { data: bulletins = [] } = useArchivedEleveSub(annee, classeId, eleveId, 'bulletins')
  const { data: notes = [] } = useArchivedEleveSub(annee, classeId, eleveId, 'notes')
  const { data: ecoleConfig } = useEcoleConfig()

  const [tab, setTab] = useState<Tab>('bulletins')
  const toast = useToast()

  const canExport = bulletins.length > 0 || notes.length > 0

  function handleExport(format: 'csv' | 'pdf') {
    try {
      const payload = {
        eleveNom,
        matricule: eleve?.matricule,
        classeNom,
        annee,
        bulletins,
        notes,
        ecoleNom: ecoleConfig?.nom,
      }
      if (format === 'csv') {
        exportTranscriptCSV(payload)
        toast.success('Relevé exporté en CSV.')
      } else {
        exportTranscriptPDF(payload)
        toast.success('Relevé PDF généré.')
      }
    } catch (err) {
      console.error('[export transcript] error:', err)
      toast.error("Échec de l'export.")
    }
  }

  if (loadingEleve && !eleve) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!eleve) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-10 w-10" />}
        title="Élève introuvable"
        description="Cet élève n'existe pas dans cette archive ou les données n'ont pas pu être chargées."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Identity card */}
      <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white font-bold text-[1.05rem]">
            {(eleveNom ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-[1.05rem] font-bold text-navy leading-tight truncate">
              {eleveNom}
            </h3>
            <p className="text-[0.78rem] text-ink-500 mt-0.5">
              {classeNom} · Année {annee}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.72rem] text-ink-600">
              {eleve.matricule && (
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck className="h-3 w-3 text-ink-400" aria-hidden />
                  Matricule : <span className="font-mono">{eleve.matricule}</span>
                </span>
              )}
              {eleve.genre && (
                <span className="inline-flex items-center gap-1">
                  <Ruler className="h-3 w-3 text-ink-400" aria-hidden />
                  {eleve.genre === 'F' ? 'Féminin' : 'Masculin'}
                </span>
              )}
              {eleve.telephoneParent && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3 text-ink-400" aria-hidden />
                  <span className="font-mono">{eleve.telephoneParent}</span>
                </span>
              )}
              {eleve.emailParent && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 text-ink-400" aria-hidden />
                  {eleve.emailParent}
                </span>
              )}
              {eleve.adresse && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 text-ink-400" aria-hidden />
                  {eleve.adresse}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Export — relevé complet (bulletins + notes) */}
        <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[0.72rem] text-ink-500">
            Relevé de scolarité : {bulletins.length} bulletin{bulletins.length > 1 ? 's' : ''}, {notes.length} note{notes.length > 1 ? 's' : ''}
          </p>
          <ExportMenu
            disabled={!canExport}
            countLabel={canExport ? 'Relevé complet (bulletins + notes)' : 'Aucune donnée à exporter'}
            onCsv={() => handleExport('csv')}
            onPdf={() => handleExport('pdf')}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 rounded-lg bg-ink-100/60 p-1 flex-wrap">
        <TabBtn active={tab === 'bulletins'} icon={<ClipboardList className="h-4 w-4" />} label="Bulletins" onClick={() => setTab('bulletins')} />
        <TabBtn active={tab === 'notes'} icon={<BookOpen className="h-4 w-4" />} label="Notes" onClick={() => setTab('notes')} />
        <TabBtn active={tab === 'absences'} icon={<CalendarOff className="h-4 w-4" />} label="Absences" onClick={() => setTab('absences')} />
        <TabBtn active={tab === 'paiements'} icon={<CreditCard className="h-4 w-4" />} label="Paiements" onClick={() => setTab('paiements')} />
      </div>

      {/* Tab content */}
      {tab === 'bulletins' && <BulletinsTab annee={annee} classeId={classeId} eleveId={eleveId} />}
      {tab === 'notes' && <NotesTab annee={annee} classeId={classeId} eleveId={eleveId} />}
      {tab === 'absences' && <AbsencesTab annee={annee} classeId={classeId} eleveId={eleveId} />}
      {tab === 'paiements' && <PaiementsTab annee={annee} classeId={classeId} eleveId={eleveId} />}
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────

function TabBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.8rem] font-semibold transition-colors',
        active ? 'bg-white text-navy shadow-sm' : 'text-ink-600 hover:text-navy hover:bg-white/50'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Bulletins ────────────────────────────────────────────────

function BulletinsTab({ annee, classeId, eleveId }: { annee: string; classeId: string; eleveId: string }) {
  const { data: bulletins = [], isLoading } = useArchivedEleveSub(
    annee,
    classeId,
    eleveId,
    'bulletins'
  )

  const sorted = useMemo(() => {
    // Sort: period number ascending, "Année" last
    return [...bulletins].sort((a, b) => {
      const aAnnee = a.periode === 'Année'
      const bAnnee = b.periode === 'Année'
      if (aAnnee !== bAnnee) return aAnnee ? 1 : -1
      return (a.periode as string).localeCompare(b.periode as string)
    })
  }, [bulletins])

  if (isLoading && sorted.length === 0) {
    return <LoadingRow />
  }
  if (sorted.length === 0) {
    return <EmptyRow icon={<ClipboardList className="h-8 w-8" />} label="Aucun bulletin archivé" />
  }

  return (
    <div className="space-y-2">
      {sorted.map((b) => {
        const isAnnual = b.periode === 'Année'
        const moy = typeof b.moyenneGenerale === 'number' ? b.moyenneGenerale : null
        const passing = moy !== null && moy >= 10
        return (
          <article
            key={b.id}
            className={cn(
              'rounded-lg border bg-white p-3.5 shadow-sm',
              isAnnual ? 'border-gold/40 ring-1 ring-gold/20' : 'border-ink-100'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-display font-bold text-[0.95rem] text-navy">
                    {isAnnual ? 'Bulletin annuel' : b.periode}
                  </h4>
                  {isAnnual && <Badge variant="warning" size="sm">Annuelle</Badge>}
                  {b.estVerrouille && (
                    <Badge variant="neutral" size="sm">Verrouillé</Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[0.72rem] text-ink-500 flex-wrap">
                  {b.rang && <span>Rang : <span className="font-semibold text-ink-700">{b.rang}</span></span>}
                  {typeof b.noteConduite === 'number' && (
                    <span>Conduite : <span className="font-mono text-ink-700">{b.noteConduite}/20</span></span>
                  )}
                  {typeof b.totalHeuresColle === 'number' && b.totalHeuresColle > 0 && (
                    <span>Colles : <span className="font-mono text-ink-700">{b.totalHeuresColle}h</span></span>
                  )}
                </div>
              </div>
              {moy !== null && (
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      'font-mono font-bold text-[1.2rem]',
                      passing ? 'text-success' : 'text-danger'
                    )}
                  >
                    {moy.toFixed(2)}
                  </div>
                  <div className="text-[0.65rem] uppercase tracking-wide text-ink-400">
                    moy. {isAnnual ? 'annuelle' : 'période'}
                  </div>
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ─── Notes ────────────────────────────────────────────────────

function NotesTab({ annee, classeId, eleveId }: { annee: string; classeId: string; eleveId: string }) {
  const { data: notes = [], isLoading } = useArchivedEleveSub(
    annee,
    classeId,
    eleveId,
    'notes'
  )

  // Group by matière → period
  const grouped = useMemo(() => {
    const byMat = new Map<string, typeof notes>()
    for (const n of notes) {
      const mat = (n.matiere ?? 'Matière inconnue') as string
      if (!byMat.has(mat)) byMat.set(mat, [])
      byMat.get(mat)!.push(n)
    }
    return Array.from(byMat.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [notes])

  if (isLoading && notes.length === 0) return <LoadingRow />
  if (grouped.length === 0) {
    return <EmptyRow icon={<BookOpen className="h-8 w-8" />} label="Aucune note archivée" />
  }

  return (
    <div className="space-y-3">
      {grouped.map(([matiere, list]) => (
        <article
          key={matiere}
          className="rounded-lg border border-ink-100 bg-white p-3.5 shadow-sm"
        >
          <h4 className="font-display font-bold text-[0.92rem] text-navy mb-2">
            {matiere}
          </h4>
          <div className="space-y-1.5">
            {list.map((n) => {
              const moy = extractMoy(n)
              const periode = (n.periode ?? '—') as string
              return (
                <div
                  key={n.id}
                  className="flex items-center gap-3 py-1 border-b border-ink-100 last:border-b-0"
                >
                  <div className="flex-1 min-w-0 text-[0.82rem] text-ink-700">
                    {periode}
                  </div>
                  {moy !== null && (
                    <span
                      className={cn(
                        'font-mono font-semibold text-[0.88rem]',
                        moy >= 10 ? 'text-success' : 'text-danger'
                      )}
                    >
                      {moy.toFixed(2)}
                    </span>
                  )}
                  {n.abandon && (
                    <Badge variant="neutral" size="sm">Abandon</Badge>
                  )}
                </div>
              )
            })}
          </div>
        </article>
      ))}
    </div>
  )
}

function extractMoy(n: { moyenneMatiere?: unknown }): number | null {
  // Legacy numeric or new object shape
  if (typeof n.moyenneMatiere === 'number') return n.moyenneMatiere
  if (n.moyenneMatiere && typeof n.moyenneMatiere === 'object') {
    const obj = n.moyenneMatiere as { moyenneInterros?: number | null; devoir1?: number | null; devoir2?: number | null }
    const vals = [obj.moyenneInterros, obj.devoir1, obj.devoir2].filter(
      (v): v is number => typeof v === 'number'
    )
    if (vals.length === 0) return null
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }
  return null
}

// ─── Absences ─────────────────────────────────────────────────

function AbsencesTab({ annee, classeId, eleveId }: { annee: string; classeId: string; eleveId: string }) {
  const { data: absences = [], isLoading } = useArchivedEleveSub(
    annee,
    classeId,
    eleveId,
    'absences'
  )

  const sorted = useMemo(() => {
    return [...absences].sort((a, b) => {
      const aDate = tsMillis(a.date)
      const bDate = tsMillis(b.date)
      return bDate - aDate
    })
  }, [absences])

  if (isLoading && absences.length === 0) return <LoadingRow />
  if (absences.length === 0) {
    return <EmptyRow icon={<CalendarOff className="h-8 w-8" />} label="Aucune absence déclarée cette année" />
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((a) => (
        <article
          key={a.id}
          className="rounded-md border border-ink-100 bg-white p-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="text-[0.82rem] font-semibold text-ink-800">
              {formatDateFR(tsToDate(a.date))}
            </div>
            <Badge
              variant={
                a.statut === 'validée' ? 'success' :
                a.statut === 'refusée' ? 'danger' :
                'warning'
              }
              size="sm"
            >
              {a.statut ?? 'en attente'}
            </Badge>
          </div>
          {a.raison && (
            <p className="mt-1 text-[0.78rem] text-ink-600 whitespace-pre-wrap break-words">
              {a.raison}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}

// ─── Paiements ────────────────────────────────────────────────

function PaiementsTab({ annee, classeId, eleveId }: { annee: string; classeId: string; eleveId: string }) {
  const { data: paiements = [], isLoading } = useArchivedEleveSub(
    annee,
    classeId,
    eleveId,
    'paiements'
  )

  const sorted = useMemo(() => {
    return [...paiements].sort((a, b) => tsMillis(b.date) - tsMillis(a.date))
  }, [paiements])

  const total = useMemo(
    () => paiements.reduce((s, p) => s + (typeof p.montant === 'number' ? p.montant : 0), 0),
    [paiements]
  )

  if (isLoading && paiements.length === 0) return <LoadingRow />
  if (paiements.length === 0) {
    return <EmptyRow icon={<CreditCard className="h-8 w-8" />} label="Aucun paiement enregistré" />
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md bg-ink-50/60 ring-1 ring-ink-100 px-3 py-2 text-[0.82rem] text-ink-700">
        Total versé : <span className="font-bold text-ink-900 font-mono">{total.toLocaleString('fr-FR')} FCFA</span>
      </div>
      {sorted.map((p) => (
        <article
          key={p.id}
          className="rounded-md border border-ink-100 bg-white p-3 shadow-sm flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="text-[0.82rem] font-semibold text-ink-800">
              {formatDateFR(tsToDate(p.date))}
            </div>
            {p.methode && (
              <div className="text-[0.7rem] text-ink-500 capitalize">
                {p.methode}
              </div>
            )}
          </div>
          <div className="font-mono font-bold text-[0.95rem] text-navy">
            {(typeof p.montant === 'number' ? p.montant : 0).toLocaleString('fr-FR')} F
          </div>
        </article>
      ))}
    </div>
  )
}

// ─── Tiny helpers ─────────────────────────────────────────────

function LoadingRow() {
  return (
    <div className="flex justify-center py-8">
      <Spinner />
    </div>
  )
}

function EmptyRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="text-center py-8 text-ink-400">
      <div className="inline-flex items-center justify-center mb-2 text-ink-300">{icon}</div>
      <p className="text-[0.85rem]">{label}</p>
    </div>
  )
}

function tsToDate(ts: Timestamp | unknown): Date | null {
  if (!ts) return null
  const t = ts as { toDate?: () => Date }
  if (typeof t.toDate === 'function') return t.toDate()
  if (ts instanceof Date) return ts
  return null
}

function tsMillis(ts: Timestamp | unknown): number {
  const d = tsToDate(ts)
  return d ? d.getTime() : 0
}

function formatDateFR(d: Date | null): string {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
      .format(d)
      .replace(/^./, (c) => c.toUpperCase())
  } catch {
    return d.toLocaleDateString('fr-FR')
  }
}
