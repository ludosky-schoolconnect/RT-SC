/**
 * RT-SC · Prof → Mes classes tab.
 *
 * Read-only overview: list of cards for each assigned class.
 * Tapping a card → drills into "Élèves de cette classe" (read-only roster).
 *
 * Phase 4b is intentionally limited to the overview. A class detail with
 * roster + per-élève actions ships in Phase 5 (when daily ops like
 * absences and presences need it).
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, Star, Users, ChevronRight, KeyRound, ShieldCheck, CalendarOff } from 'lucide-react'
import { Section, SectionHeader } from '@/components/layout/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/auth'
import { useClasses, useClasseEleveCount } from '@/hooks/useClasses'
import { nomClasse } from '@/lib/benin'
import type { Classe } from '@/types/models'
import { motion } from 'framer-motion'
import { ModalParentCodes } from './ModalParentCodes'
import { ModalAbsencesClasse } from '@/routes/_shared/absences/ModalAbsencesClasse'
import { ExamCountdownWidget } from '@/components/ExamCountdownWidget'

export function MesClassesTab() {
  const profil = useAuthStore((s) => s.profil)
  const { data: allClasses = [], isLoading } = useClasses()

  const myClasses = useMemo(() => {
    const ids = new Set(profil?.classesIds ?? [])
    return allClasses.filter((c) => ids.has(c.id))
  }, [allClasses, profil?.classesIds])

  const ppClasses = useMemo(
    () => myClasses.filter((c) => c.profPrincipalId === profil?.id),
    [myClasses, profil?.id]
  )

  // Niveaux of the classes this prof teaches — used by the exam
  // countdown widget to decide whether to render. Widget self-hides
  // if none are exam-eligible.
  const classLevels = useMemo(
    () => myClasses.map((c) => c.niveau),
    [myClasses]
  )

  return (
    <Section>
      <ExamCountdownWidget mode="prof" classLevels={classLevels} />

      <SectionHeader
        kicker="Référence"
        title="Mes classes"
        description={`${myClasses.length} classe${myClasses.length > 1 ? 's' : ''} assignée${myClasses.length > 1 ? 's' : ''}${ppClasses.length > 0 ? ` · ${ppClasses.length} en tant que professeur principal` : ''}.`}
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : myClasses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-10 w-10" />}
          title="Aucune classe assignée"
          description="L'administration doit vous assigner au moins une classe pour que vous puissiez intervenir."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {myClasses.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: Math.min(i * 0.04, 0.3) },
              }}
            >
              <ClasseCard
                classe={c}
                isPP={c.profPrincipalId === profil?.id}
              />
            </motion.div>
          ))}
        </div>
      )}
    </Section>
  )
}

function ClasseCard({ classe, isPP }: { classe: Classe; isPP: boolean }) {
  const { data: count, isLoading } = useClasseEleveCount(classe.id)
  const [codesOpen, setCodesOpen] = useState(false)
  const [absencesOpen, setAbsencesOpen] = useState(false)
  const goToNotes = `/prof?tab=notes&classe=${classe.id}`

  return (
    <>
      <div className="group relative block w-full text-left bg-white rounded-lg border-[1.5px] border-ink-100 p-4 hover:border-navy transition-colors duration-150 select-none">
        <Link
          to={goToNotes}
          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          aria-label={`Ouvrir ${nomClasse(classe)}`}
        />
        {/* Top accent strip */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
              {classe.cycle === 'premier' ? 'Premier cycle' : 'Second cycle'}
            </p>
            <h3 className="font-display text-lg font-bold text-navy tracking-tight mt-0.5">
              {nomClasse(classe)}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {isPP && (
              <Badge variant="gold" size="sm" leadingIcon={<Star className="h-3 w-3" />}>
                PP
              </Badge>
            )}
            {classe.serie && (
              <Badge variant="navy" size="sm">
                Série {classe.serie}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[0.8125rem] text-ink-600 mb-3">
          <Users className="h-3.5 w-3.5 text-ink-400" aria-hidden />
          {isLoading ? (
            <span className="text-ink-400">—</span>
          ) : (
            <>
              <span className="font-semibold text-ink-800">{count}</span>
              <span>{count === 1 ? 'élève' : 'élèves'}</span>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-ink-100">
          <Badge variant="neutral" size="sm" leadingIcon={<KeyRound className="h-3 w-3" />}>
            {classe.passkey}
          </Badge>
          <div className="flex items-center gap-1">
            {isPP && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setCodesOpen(true)
                }}
                className="relative z-10 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-gold-dark hover:text-navy px-2 py-1 rounded transition-colors !min-h-0 !min-w-0"
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Codes
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setAbsencesOpen(true)
              }}
              className="relative z-10 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-warning hover:text-navy px-2 py-1 rounded transition-colors !min-h-0 !min-w-0"
              aria-label={`Voir les absences de ${nomClasse(classe)}`}
            >
              <CalendarOff className="h-3 w-3" aria-hidden />
              Absences
            </button>
            <Link
              to={goToNotes}
              className="relative z-10 text-[0.78rem] text-ink-400 font-semibold inline-flex items-center gap-1 group-hover:text-navy transition-colors px-2 py-1 -mr-2 rounded select-none"
              aria-label={`Saisir des notes pour ${nomClasse(classe)}`}
            >
              Notes
              <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {isPP && (
        <ModalParentCodes
          open={codesOpen}
          onClose={() => setCodesOpen(false)}
          classeId={classe.id}
          classeName={nomClasse(classe)}
        />
      )}

      <ModalAbsencesClasse
        open={absencesOpen}
        onClose={() => setAbsencesOpen(false)}
        classeId={classe.id}
        classeNom={nomClasse(classe)}
      />
    </>
  )
}
