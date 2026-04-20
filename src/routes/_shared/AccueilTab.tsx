/**
 * RT-SC · AccueilTab — ÉLÈVE home screen.
 *
 * Personal HOME for the élève. Multi-widget at-a-glance dashboard:
 *
 *   1. "Mon suivi" — LIVE widgets reading real Firestore data:
 *        • Featured bulletin (latest annual or last period)
 *        • Heures de colle (per-period breakdown)
 *
 *   2. "À venir" — preview widgets prefiguring upcoming modules:
 *        • English Hub (legacy feature, dedicated phase later)
 *        • Annonces (Phase 5b)
 *
 * For the parent equivalent, see ParentAccueilTab — parent-framed
 * greeting and parent-specific widgets.
 */

import { motion } from 'framer-motion'
import { GraduationCap, Globe } from 'lucide-react'

import { HeuresColleWidget } from '@/routes/_shared/colles/HeuresColleWidget'
import { AnnoncesWidget } from '@/routes/_shared/annonces/AnnoncesWidget'
import { CoursDuJourWidget } from '@/routes/_shared/emploi/CoursDuJourWidget'
import { useGreeting } from '@/hooks/useGreeting'

import { PreviewWidget } from './accueilPrimitives'

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
            À venir
          </p>
          <PreviewWidget
            icon={<Globe className="h-5 w-5" />}
            iconTone="info"
            label="English Hub"
            description="Mot du jour, quiz, streak"
            decorative="🇬🇧"
          />
        </section>
      </div>
    </div>
  )
}
