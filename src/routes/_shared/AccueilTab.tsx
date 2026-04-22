/**
 * RT-SC · AccueilTab — ÉLÈVE home screen.
 *
 * Personal HOME for the élève. Multi-widget at-a-glance dashboard:
 *
 *   1. "Mon suivi" — LIVE widgets reading real Firestore data:
 *        • Cours du jour
 *        • Heures de colle (per-period breakdown)
 *        • Annonces
 *
 *   2. "Scolarité" — PaiementWidget.
 *
 *   3. "Apprentissage" — English Hub (daily word + quiz + streak).
 *
 * For the parent equivalent, see ParentAccueilTab — parent-framed
 * greeting and parent-specific widgets.
 */

import { motion } from 'framer-motion'
import { GraduationCap } from 'lucide-react'

import { HeuresColleWidget } from '@/routes/_shared/colles/HeuresColleWidget'
import { AnnoncesWidget } from '@/routes/_shared/annonces/AnnoncesWidget'
import { CoursDuJourWidget } from '@/routes/_shared/emploi/CoursDuJourWidget'
import { PaiementWidget } from '@/routes/_shared/PaiementWidget'
import { EnglishHubWidget } from '@/routes/_shared/EnglishHubWidget'
import { LaboWidget } from '@/routes/_shared/labo/LaboWidget'
import { BilanAnnuelWidget } from '@/routes/_shared/BilanAnnuelWidget'
import { ExamCountdownWidget } from '@/components/ExamCountdownWidget'
import { useGreeting } from '@/hooks/useGreeting'
import { getExamLevel } from '@/lib/exam-utils'

interface AccueilTabProps {
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  anneeScolaire?: string
  onNavigateToBulletins?: () => void
  onNavigateToEmploi?: () => void
  onNavigateToPlus?: () => void
}

export function AccueilTab({
  classeId,
  classeNom,
  eleveId,
  eleveName,
  anneeScolaire,
  onNavigateToEmploi,
}: AccueilTabProps) {
  const { greeting } = useGreeting()

  const firstName = (eleveName.split(/\s+/)[0] ?? eleveName).trim()

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[260px] -z-10 bg-gradient-to-b from-info-bg via-info-bg/40 to-transparent"
      />
      <div
        aria-hidden
        className="absolute right-0 top-[60px] -z-10 opacity-[0.06] translate-x-8"
      >
        <GraduationCap className="h-72 w-72 text-navy" strokeWidth={1.2} />
      </div>

      <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-6 pb-8 space-y-5">
        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="font-display text-[1.75rem] sm:text-3xl text-navy font-bold leading-[1.1]">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-[0.875rem] text-ink-600 mt-1.5">
            {classeNom}{anneeScolaire ? ` · Année ${anneeScolaire}` : ''}
          </p>
        </motion.header>

        {/* Bilan annuel — only rendered once the PP closes the year.
            Placed at the very top so the end-of-year verdict is the
            first thing the student sees. Self-hides otherwise. */}
        <BilanAnnuelWidget
          classeId={classeId}
          eleveId={eleveId}
          eleveName={eleveName}
        />

        {/* Exam countdown — visible only for 3ème / Terminale students.
            Self-hides for other levels and when no countdowns exist. */}
        <ExamCountdownWidget
          mode="eleve"
          eleveLevel={getExamLevel(classeNom)}
        />

        <section className="pt-2 space-y-3">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1">
            Mon suivi
          </p>
          <CoursDuJourWidget
            classeId={classeId}
            onOpenEmploi={onNavigateToEmploi}
          />
          <HeuresColleWidget classeId={classeId} eleveId={eleveId} />
          <AnnoncesWidget classeIds={[classeId]} />
        </section>

        <section className="pt-2 space-y-3">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1">
            Scolarité
          </p>
          <PaiementWidget classeId={classeId} eleveId={eleveId} />
        </section>

        <section className="pt-2 space-y-3">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1">
            Apprentissage
          </p>
          <EnglishHubWidget classeId={classeId} eleveId={eleveId} />
          <LaboWidget />
        </section>
      </div>
    </div>
  )
}
