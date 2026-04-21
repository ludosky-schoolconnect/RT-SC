/**
 * RT-SC · Year archive — top-level section for the Année tab.
 *
 * Drill-in navigation: Years → Classes → Élèves → Élève detail.
 * State held in a `crumbs` tuple at this level; child views receive
 * callbacks to drill down or navigate up.
 *
 * All data is read-only. No mutations anywhere in this subtree.
 *
 * Placed as a new section below DangerZoneCard in AnneeTab (see
 * Phase 4g notes for rationale).
 */

import { useState } from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/cn'
import { YearsList } from './YearsList'
import { ClassesList } from './ClassesList'
import { ElevesList } from './ElevesList'
import { EleveDetail } from './EleveDetail'

interface Crumbs {
  annee: string | null
  classeId: string | null
  classeNom: string | null
  eleveId: string | null
  eleveNom: string | null
}

const EMPTY_CRUMBS: Crumbs = {
  annee: null,
  classeId: null,
  classeNom: null,
  eleveId: null,
  eleveNom: null,
}

export function YearArchiveSection() {
  const [crumbs, setCrumbs] = useState<Crumbs>(EMPTY_CRUMBS)

  function resetAll() {
    setCrumbs(EMPTY_CRUMBS)
  }

  function goYear(annee: string) {
    setCrumbs({ ...EMPTY_CRUMBS, annee })
  }

  function goClasse(classeId: string, classeNom: string) {
    setCrumbs((c) => ({ ...c, classeId, classeNom, eleveId: null, eleveNom: null }))
  }

  function goEleve(eleveId: string, eleveNom: string) {
    setCrumbs((c) => ({ ...c, eleveId, eleveNom }))
  }

  function backToYears() {
    resetAll()
  }

  function backToClasses() {
    setCrumbs((c) => ({ ...c, classeId: null, classeNom: null, eleveId: null, eleveNom: null }))
  }

  function backToEleves() {
    setCrumbs((c) => ({ ...c, eleveId: null, eleveNom: null }))
  }

  // Which view to render
  const depth = crumbs.eleveId
    ? 'eleve'
    : crumbs.classeId
      ? 'eleves'
      : crumbs.annee
        ? 'classes'
        : 'years'

  return (
    <div>
      <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
        Archives annuelles
      </p>
      <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="font-display text-[1rem] font-bold text-navy">
            Années précédentes
          </h3>
          <p className="text-[0.78rem] text-ink-500 mt-0.5">
            Consultez les années scolaires archivées après transition. Lecture seule.
          </p>
        </div>

      {/* Breadcrumb */}
      {crumbs.annee && (
        <nav
          aria-label="Fil d'Ariane"
          className="mb-4 flex items-center gap-1 text-[0.78rem] text-ink-500 flex-wrap"
        >
          <BreadcrumbLink onClick={backToYears} icon={<Home className="h-3.5 w-3.5" />}>
            Années
          </BreadcrumbLink>
          <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />
          <BreadcrumbLink
            onClick={crumbs.classeId ? backToClasses : undefined}
            active={!crumbs.classeId}
          >
            {crumbs.annee}
          </BreadcrumbLink>
          {crumbs.classeNom && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />
              <BreadcrumbLink
                onClick={crumbs.eleveId ? backToEleves : undefined}
                active={!crumbs.eleveId}
              >
                {crumbs.classeNom}
              </BreadcrumbLink>
            </>
          )}
          {crumbs.eleveNom && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />
              <BreadcrumbLink active>{crumbs.eleveNom}</BreadcrumbLink>
            </>
          )}
        </nav>
      )}

      {/* Body */}
      {depth === 'years' && <YearsList onPick={goYear} />}
      {depth === 'classes' && crumbs.annee && (
        <ClassesList annee={crumbs.annee} onPick={goClasse} />
      )}
      {depth === 'eleves' && crumbs.annee && crumbs.classeId && (
        <ElevesList
          annee={crumbs.annee}
          classeId={crumbs.classeId}
          onPick={goEleve}
        />
      )}
      {depth === 'eleve' &&
        crumbs.annee &&
        crumbs.classeId &&
        crumbs.eleveId && (
          <EleveDetail
            annee={crumbs.annee}
            classeId={crumbs.classeId}
            eleveId={crumbs.eleveId}
            eleveNom={crumbs.eleveNom ?? ''}
            classeNom={crumbs.classeNom ?? ''}
          />
        )}
      </div>
    </div>
  )
}

// ─── Breadcrumb link ──────────────────────────────────────────

function BreadcrumbLink({
  onClick,
  children,
  active = false,
  icon,
}: {
  onClick?: () => void
  children: React.ReactNode
  active?: boolean
  icon?: React.ReactNode
}) {
  if (!onClick || active) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
          active ? 'font-semibold text-navy' : 'text-ink-400'
        )}
      >
        {icon}
        {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-ink-100 hover:text-navy transition-colors !min-h-0"
    >
      {icon}
      {children}
    </button>
  )
}
