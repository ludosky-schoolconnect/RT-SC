/**
 * RT-SC · BulletinView component (shared between display + PDF).
 *
 * Renders a polished, official-looking school bulletin matching standard
 * Béninois CEG layouts. Used inside modals (PP), in élève/parent
 * dashboards (Phase 4e), and as the source for PDF generation (Phase 4e).
 *
 * Two modes:
 *   - mode='periode' renders a single-period bulletin (matières table)
 *   - mode='annuelle' renders the annual bulletin (period summary)
 *
 * Designed to print well: page-break friendly, no overlapping shadows,
 * generous margins. A future `data-printable` flag will let the PDF
 * generator strip interactive bits.
 */

import { motion } from 'framer-motion'
import { Award, FileText } from 'lucide-react'
import type {
  BulletinAnnualView,
  BulletinPeriodView,
} from '@/lib/bulletinView'
import { statutLabel } from '@/lib/statutLabel'
import { cn } from '@/lib/cn'

interface BulletinViewProps {
  view: BulletinPeriodView | BulletinAnnualView
  mode: 'periode' | 'annuelle'
}

export function BulletinView({ view, mode }: BulletinViewProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white rounded-md border-[1.5px] border-ink-200 overflow-hidden font-display"
      data-printable="true"
    >
      <BulletinHeader view={view} mode={mode} />
      <BulletinIdentity view={view} />
      {mode === 'periode' ? (
        <PeriodeBody view={view as BulletinPeriodView} />
      ) : (
        <AnnualBody view={view as BulletinAnnualView} />
      )}
      <BulletinFooter view={view} mode={mode} />
    </motion.article>
  )
}

// ─── Header ──────────────────────────────────────────────────

function BulletinHeader({
  view,
  mode,
}: {
  view: BulletinPeriodView | BulletinAnnualView
  mode: 'periode' | 'annuelle'
}) {
  return (
    <header className="border-b-2 border-navy/15 px-5 pt-5 pb-4">
      {/* Top row: school identity / republic */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-navy text-base sm:text-lg leading-tight uppercase tracking-wide">
            {view.ecole.nom ?? 'Établissement'}
          </p>
          {view.ecole.ville && (
            <p className="text-[0.78rem] text-ink-500 mt-0.5">
              {view.ecole.ville}
            </p>
          )}
          {view.ecole.devise && (
            <p className="text-[0.7rem] text-gold-dark italic mt-1">
              « {view.ecole.devise} »
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[0.7rem] uppercase tracking-widest text-ink-400 font-bold">
            République du Bénin
          </p>
          <p className="text-[0.7rem] text-ink-400 mt-0.5">
            Année scolaire {view.anneeScolaire}
          </p>
        </div>
      </div>

      {/* Bulletin title */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-ink-100">
        <div className="flex items-center gap-2">
          {mode === 'annuelle' ? (
            <Award className="h-4 w-4 text-gold-dark" aria-hidden />
          ) : (
            <FileText className="h-4 w-4 text-navy" aria-hidden />
          )}
          <p className="font-bold text-navy uppercase tracking-wider text-[0.78rem]">
            {mode === 'annuelle' ? 'Bulletin annuel' : 'Bulletin de notes'}
          </p>
        </div>
        <p className="text-[0.78rem] font-semibold text-ink-700">
          {mode === 'annuelle'
            ? 'Année'
            : (view as BulletinPeriodView).periode}
        </p>
      </div>
    </header>
  )
}

// ─── Identity block ──────────────────────────────────────────

function BulletinIdentity({
  view,
}: {
  view: BulletinPeriodView | BulletinAnnualView
}) {
  return (
    <div className="px-5 py-4 bg-ink-50/40 border-b border-ink-100">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.78rem]">
        <IdentityRow label="Nom et prénoms" value={view.eleve.nom} bold />
        <IdentityRow label="Classe" value={view.classe.nomComplet} bold />
        <IdentityRow label="Date de naissance" value={view.eleve.dateNaissance} />
        <IdentityRow
          label="Sexe"
          value={view.eleve.genre === 'F' ? 'Féminin' : 'Masculin'}
        />
      </div>
    </div>
  )
}

function IdentityRow({
  label,
  value,
  bold = false,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-ink-400 text-[0.65rem] font-semibold uppercase tracking-wider leading-tight">
        {label}
      </p>
      <p
        className={cn(
          'leading-tight mt-0.5 break-words',
          bold ? 'font-bold text-navy text-[0.875rem]' : 'text-ink-700 text-[0.8125rem]'
        )}
      >
        {value || '—'}
      </p>
    </div>
  )
}

// ─── Periode body (the matières table) ───────────────────────

function PeriodeBody({ view }: { view: BulletinPeriodView }) {
  return (
    <div className="px-5 py-4">
      <div className="overflow-x-auto rounded border border-ink-200">
        <table className="w-full text-[0.78rem] border-collapse">
          <thead>
            <tr className="bg-navy text-white text-[0.65rem] font-bold uppercase tracking-wider">
              <th className="px-2 py-2 text-left">Matière</th>
              <th className="px-2 py-2 text-center w-12">M.I.</th>
              <th className="px-2 py-2 text-center w-12">Dev1</th>
              <th className="px-2 py-2 text-center w-12">Dev2</th>
              <th className="px-2 py-2 text-center w-14 bg-navy/90">Moy</th>
              <th className="px-2 py-2 text-center w-12">Coef</th>
              <th className="px-2 py-2 text-center w-16 bg-navy/90">Total</th>
            </tr>
          </thead>
          <tbody>
            {view.matieres.map((row, idx) => (
              <MatiereRow key={row.matiere} row={row} alt={idx % 2 === 1} />
            ))}
            {/* Conduite line */}
            <ConduiteRow view={view} />
          </tbody>
          <tfoot>
            <tr className="bg-gold/15 border-t-2 border-gold/40 font-bold">
              <td className="px-2 py-2 text-navy text-[0.78rem] uppercase tracking-wide">
                Totaux
              </td>
              <td colSpan={3} className="px-2 py-2 text-right text-ink-500 text-[0.7rem]">
                Moyenne générale
              </td>
              <td
                className={cn(
                  'px-2 py-2 text-center font-mono tabular-nums text-base',
                  view.moyenneGenerale >= 10 ? 'text-success' : 'text-danger'
                )}
              >
                {view.moyenneGenerale.toFixed(2)}
              </td>
              <td className="px-2 py-2 text-center font-mono text-ink-700 tabular-nums text-[0.78rem]">
                {view.totalCoeffs}
              </td>
              <td className="px-2 py-2 text-center font-mono text-navy tabular-nums text-[0.78rem]">
                {view.totalPoints.toFixed(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Verdict + Rang strip */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <VerdictTile label="Moyenne" value={view.moyenneGenerale.toFixed(2)} suffix="/ 20" tone={view.moyenneGenerale >= 10 ? 'success' : 'danger'} />
        <VerdictTile label="Rang" value={view.rang ?? '—'} tone="navy" />
        <VerdictTile label="Mention" value={view.mention} tone={mentionTone(view.mention)} />
      </div>
    </div>
  )
}

function MatiereRow({
  row,
  alt,
}: {
  row: BulletinPeriodView['matieres'][number]
  alt: boolean
}) {
  if (row.abandonne) {
    return (
      <tr className={cn('border-t border-ink-100', alt ? 'bg-ink-50/30' : 'bg-white')}>
        <td className="px-2 py-1.5 text-ink-700 font-semibold">{row.matiere}</td>
        <td colSpan={6} className="px-2 py-1.5 text-center text-warning text-[0.7rem] italic">
          Élève absent (matière non comptabilisée)
        </td>
      </tr>
    )
  }
  return (
    <tr className={cn('border-t border-ink-100', alt ? 'bg-ink-50/30' : 'bg-white')}>
      <td className="px-2 py-1.5 text-ink-700 font-semibold">{row.matiere}</td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-ink-600">
        <div className="leading-tight">
          <div className="font-semibold text-navy">{fmt(row.moyenneInterros)}</div>
          {(row.interros ?? []).length > 0 && (
            <div className="text-[0.6rem] text-ink-400 mt-0.5 font-normal italic">
              {(row.interros ?? []).map((v) => fmt1(v)).join(' · ')}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-ink-600">
        {fmt(row.devoir1)}
      </td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-ink-600">
        {fmt(row.devoir2)}
      </td>
      <td
        className={cn(
          'px-2 py-1.5 text-center font-mono tabular-nums font-bold',
          row.moyenneMatiere === null
            ? 'text-ink-400'
            : row.moyenneMatiere >= 10
              ? 'text-success'
              : 'text-danger'
        )}
      >
        {fmt(row.moyenneMatiere)}
      </td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-ink-600">
        {row.coefficient}
      </td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-navy">
        {row.totalPoints !== null ? row.totalPoints.toFixed(1) : '—'}
      </td>
    </tr>
  )
}

function ConduiteRow({ view }: { view: BulletinPeriodView }) {
  const total = view.noteConduite * view.coeffConduite
  return (
    <tr className="border-t border-ink-200 bg-info-bg/40">
      <td className="px-2 py-1.5 text-navy font-semibold flex items-center gap-1">
        Conduite
        {view.totalHeuresColle > 0 && (
          <span className="text-[0.65rem] text-warning font-normal italic">
            (−{view.totalHeuresColle}h colle)
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-ink-400">
        {view.baseConduite}
      </td>
      <td colSpan={2} className="px-2 py-1.5 text-center text-ink-400 text-[0.7rem]">
        Base
      </td>
      <td
        className={cn(
          'px-2 py-1.5 text-center font-mono tabular-nums font-bold',
          view.noteConduite >= 10 ? 'text-success' : 'text-danger'
        )}
      >
        {view.noteConduite.toFixed(2)}
      </td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-ink-600">
        {view.coeffConduite}
      </td>
      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-navy">
        {total.toFixed(1)}
      </td>
    </tr>
  )
}

// ─── Annual body ─────────────────────────────────────────────

function AnnualBody({ view }: { view: BulletinAnnualView }) {
  return (
    <div className="px-5 py-4">
      <div className="overflow-x-auto rounded border border-ink-200">
        <table className="w-full text-[0.78rem] border-collapse">
          <thead>
            <tr className="bg-navy text-white text-[0.65rem] font-bold uppercase tracking-wider">
              <th className="px-2 py-2 text-left">Période</th>
              <th className="px-2 py-2 text-center w-20">Moy. générale</th>
              <th className="px-2 py-2 text-center w-20">Rang</th>
              <th className="px-2 py-2 text-center">Mention</th>
            </tr>
          </thead>
          <tbody>
            {view.periodRows.map((row, idx) => (
              <tr key={row.periode} className={cn('border-t border-ink-100', idx % 2 === 1 ? 'bg-ink-50/30' : 'bg-white')}>
                <td className="px-2 py-2 text-ink-700 font-semibold">{row.periode}</td>
                <td className={cn('px-2 py-2 text-center font-mono tabular-nums font-bold', row.moyenneGenerale >= 10 ? 'text-success' : 'text-danger')}>
                  {row.moyenneGenerale.toFixed(2)}
                </td>
                <td className="px-2 py-2 text-center font-mono tabular-nums text-ink-700">
                  {row.rang ?? '—'}
                </td>
                <td className={cn('px-2 py-2 text-center font-semibold', mentionToneText(row.mention))}>
                  {row.mention}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gold/15 border-t-2 border-gold/40 font-bold">
              <td className="px-2 py-3 text-navy uppercase tracking-wide text-[0.78rem]">
                Année
                <span className="block text-[0.65rem] font-normal text-ink-500 italic mt-0.5">
                  Formule {view.formuleUsed} : {view.formuleLabel}
                </span>
              </td>
              <td
                className={cn(
                  'px-2 py-3 text-center font-mono tabular-nums text-base',
                  view.moyenneAnnuelle >= 10 ? 'text-success' : 'text-danger'
                )}
              >
                {view.moyenneAnnuelle.toFixed(2)}
              </td>
              <td className="px-2 py-3 text-center font-mono tabular-nums text-navy">
                {view.rangAnnuel ?? '—'}
              </td>
              <td className={cn('px-2 py-3 text-center', mentionToneText(view.mention))}>
                {view.mention}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Statut tile */}
      <div className="mt-4 flex justify-center">
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-md border-2 px-4 py-2',
            view.statutAnnuel === 'Admis'
              ? 'bg-success-bg border-success text-success'
              : 'bg-danger-bg border-danger text-danger'
          )}
        >
          <Award className="h-5 w-5" aria-hidden />
          <p className="font-bold text-base uppercase tracking-wider">
            {statutLabel(
              view.statutAnnuel,
              view.eleve.genre === 'M' || view.eleve.genre === 'F'
                ? view.eleve.genre
                : null
            )}{' '}
            en classe supérieure
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Footer ──────────────────────────────────────────────────

function BulletinFooter({
  view,
  mode,
}: {
  view: BulletinPeriodView | BulletinAnnualView
  mode: 'periode' | 'annuelle'
}) {
  const date = new Date(view.dateCalcul)
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  return (
    <footer className="px-5 py-4 border-t border-ink-100 bg-ink-50/40">
      {/* Signatures */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <SignatureBlock label="Le/La PP" />
        <SignatureBlock label="Le Censeur" />
        <SignatureBlock label="Les parents" />
      </div>

      {/* Issued line */}
      <p className="text-[0.7rem] text-ink-400 italic text-center">
        Bulletin émis le {dateStr}
        {mode === 'annuelle' && view.estVerrouille && ' · Document officiel'}
      </p>
    </footer>
  )
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div className="text-center">
      <p className="text-[0.65rem] uppercase tracking-wider text-ink-400 font-bold mb-6">
        {label}
      </p>
      <div className="border-t border-ink-300 mt-1" />
    </div>
  )
}

// ─── Verdict tile ────────────────────────────────────────────

function VerdictTile({
  label,
  value,
  suffix,
  tone,
}: {
  label: string
  value: string
  suffix?: string
  tone: 'success' | 'danger' | 'navy' | 'gold'
}) {
  const T: Record<typeof tone, string> = {
    success: 'border-success/30 bg-success-bg/50 text-success',
    danger: 'border-danger/30 bg-danger-bg/50 text-danger',
    navy: 'border-navy/15 bg-info-bg/40 text-navy',
    gold: 'border-gold/40 bg-gold/10 text-gold-dark',
  }
  return (
    <div className={cn('rounded-md border-[1.5px] px-3 py-2 text-center', T[tone])}>
      <p className="text-[0.65rem] uppercase tracking-wider font-bold opacity-70">
        {label}
      </p>
      <p className="font-display tabular-nums font-bold text-xl mt-0.5 leading-none">
        {value}
        {suffix && (
          <span className="text-[0.7rem] font-normal opacity-60"> {suffix}</span>
        )}
      </p>
    </div>
  )
}

function mentionTone(m: BulletinPeriodView['mention']): 'success' | 'danger' | 'navy' | 'gold' {
  if (m === 'Excellent' || m === 'Très bien') return 'gold'
  if (m === 'Bien' || m === 'Passable') return 'navy'
  return 'danger'
}
function mentionToneText(m: BulletinPeriodView['mention']): string {
  if (m === 'Excellent' || m === 'Très bien') return 'text-gold-dark'
  if (m === 'Bien') return 'text-success'
  if (m === 'Passable') return 'text-navy'
  return 'text-danger'
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return n.toFixed(2)
}

/** Compact format for individual interro values: integer if whole, else 1 decimal. */
function fmt1(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(1)
}
