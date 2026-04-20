/**
 * RT-SC · Prof → Notes tab.
 *
 * Two modes (URL param `?mode=saisie|bulletins`):
 *   - Saisie (default): per-matière entry grid with autosave + closure
 *   - Bulletins (PP only): cross-matière dashboard for PP classes
 *
 * The mode switcher pill only renders if the prof is PP of at least one
 * class. Non-PP profs always see Saisie mode without the switcher.
 *
 * Saisie selectors: Class / Matière / Period (period auto-defaults via
 * BulletinConfig.periodeDates or Bénin calendar fallback).
 *
 * Bulletins mode: scaffold only in Phase 4c-i. Phase 4c-ii fills it with
 * the cross-matière table + period bulletin generation (Layer B + ranking).
 */

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import {
  GraduationCap,
  BookOpen,
  AlertCircle,
  ClipboardList,
  FileText,
  Star,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useClasses } from '@/hooks/useClasses'
import { useMatieres } from '@/hooks/useMatieres'
import { useBulletinConfig } from '@/hooks/useBulletinConfig'
import { useMyPPClasses } from '@/hooks/useMyPPClasses'
import { listPeriodes, currentPeriode } from '@/lib/bulletin'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'
import { NotesGrid } from './NotesGrid'
import { BulletinsMode as RealBulletinsMode } from './bulletins/BulletinsMode'

type Mode = 'saisie' | 'bulletins'

export function NotesTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isPP } = useMyPPClasses()
  const rawMode = (searchParams.get('mode') ?? 'saisie') as Mode
  const mode: Mode = rawMode === 'bulletins' && isPP ? 'bulletins' : 'saisie'

  function setMode(next: Mode) {
    const np = new URLSearchParams(searchParams)
    if (next === 'saisie') np.delete('mode')
    else np.set('mode', next)
    setSearchParams(np, { replace: true })
  }

  return (
    <Section>
      {/* Mode switcher (only when PP) */}
      {isPP && (
        <div className="mb-4 flex">
          <div className="inline-flex items-center gap-1 rounded-md bg-white border border-ink-100 p-1 shadow-sm">
            <ModePill
              active={mode === 'saisie'}
              onClick={() => setMode('saisie')}
              icon={<ClipboardList className="h-4 w-4" />}
              label="Saisie"
            />
            <ModePill
              active={mode === 'bulletins'}
              onClick={() => setMode('bulletins')}
              icon={<FileText className="h-4 w-4" />}
              label="Bulletins"
            />
          </div>
        </div>
      )}

      {mode === 'saisie' ? <SaisieMode /> : <BulletinsMode />}
    </Section>
  )
}

// ─── Mode pill ───────────────────────────────────────────────

function ModePill({
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
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors',
        active ? 'bg-navy text-white' : 'text-ink-500 hover:text-navy'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Saisie mode (the daily workflow) ────────────────────────

function SaisieMode() {
  const profil = useAuthStore((s) => s.profil)
  const { data: allClasses = [], isLoading: classesLoading } = useClasses()
  const { data: matieresGlobales = [] } = useMatieres()
  const { data: bulletinConfig } = useBulletinConfig()
  const { isPP, ppClasses } = useMyPPClasses()

  const [searchParams, setSearchParams] = useSearchParams()
  const classeId = searchParams.get('classe') ?? ''
  const matiere = searchParams.get('matiere') ?? ''
  const periode = searchParams.get('periode') ?? ''

  const myClasses = useMemo(() => {
    const ids = new Set(profil?.classesIds ?? [])
    return allClasses.filter((c) => ids.has(c.id))
  }, [allClasses, profil?.classesIds])

  const myMatieres = useMemo(() => {
    const taught = new Set(profil?.matieres ?? [])
    return matieresGlobales.filter((m) => taught.has(m))
  }, [matieresGlobales, profil?.matieres])

  const periodOptions = useMemo(() => {
    if (!bulletinConfig) return []
    return listPeriodes(bulletinConfig.typePeriode, bulletinConfig.nbPeriodes)
  }, [bulletinConfig])

  // Auto-default selectors when first loading
  useEffect(() => {
    if (!bulletinConfig) return
    let changed = false
    const next = new URLSearchParams(searchParams)

    if (!classeId && myClasses.length === 1) {
      next.set('classe', myClasses[0].id)
      changed = true
    }
    if (!matiere && myMatieres.length === 1) {
      next.set('matiere', myMatieres[0])
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
  }, [
    bulletinConfig,
    myClasses,
    myMatieres,
    classeId,
    matiere,
    periode,
    searchParams,
    setSearchParams,
  ])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const ready = !!classeId && !!matiere && !!periode

  return (
    <>
      <SectionHeader
        kicker="Saisie des notes"
        title="Mes notes"
        description="Sélectionnez la classe, la matière et la période pour saisir vos notes."
      />

      {/* Optional PP hint banner */}
      {isPP && (
        <div className="mb-4 rounded-md bg-info-bg/50 border border-navy/15 px-4 py-3 flex items-start gap-2">
          <Star className="h-4 w-4 text-gold shrink-0 mt-0.5" aria-hidden />
          <div className="text-[0.8125rem] text-navy leading-snug">
            Vous êtes professeur principal de{' '}
            <strong>
              {ppClasses.map((c) => nomClasse(c)).join(', ')}
            </strong>
            . Une fois que toutes les matières d'une période sont clôturées,
            vous pourrez générer les bulletins dans l'onglet <em>Bulletins</em>.
          </div>
        </div>
      )}

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Select
          label="Classe"
          value={classeId}
          onChange={(e) => setParam('classe', e.target.value)}
          disabled={classesLoading || myClasses.length === 0}
        >
          <option value="">— Choisir —</option>
          {myClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {nomClasse(c)}
            </option>
          ))}
        </Select>
        <Select
          label="Matière"
          value={matiere}
          onChange={(e) => setParam('matiere', e.target.value)}
          disabled={myMatieres.length === 0}
        >
          <option value="">— Choisir —</option>
          {myMatieres.map((m) => (
            <option key={m} value={m}>
              {m}
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

      {/* Body */}
      {classesLoading || !bulletinConfig ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : myClasses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-10 w-10" />}
          title="Aucune classe assignée"
          description="L'administration doit vous assigner au moins une classe avant que vous puissiez saisir des notes."
        />
      ) : myMatieres.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title="Aucune matière définie"
          description="Vos matières enseignées sont vides ou ne correspondent à aucune matière de l'établissement. Contactez l'administration."
        />
      ) : !ready ? (
        <EmptyState
          icon={<AlertCircle className="h-10 w-10" />}
          title="Sélectionnez les filtres"
          description="Choisissez une classe, une matière et une période pour afficher la grille de saisie."
        />
      ) : (
        <NotesGrid classeId={classeId} matiere={matiere} periode={periode} />
      )}
    </>
  )
}

// ─── Bulletins mode (Phase 4c-ii — real implementation) ───

function BulletinsMode() {
  return <RealBulletinsMode />
}
