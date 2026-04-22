/**
 * RT-SC · ParentAccueilTab — PARENT home screen.
 *
 * Parent-facing summary of ONE active child. Parent-framed greeting
 * and parent-specific widget categories (distinct from the élève
 * Accueil):
 *
 *   HERO      — Time-aware greeting + "Voici le résumé de {child}"
 *   SUIVI     — Live: featured bulletin + heures de colle
 *   VIE DE    — Preview (ship as modules land):
 *   L'ÉCOLE      • Absences (Phase 5d)
 *                • Paiement (Phase 6)
 *                • Annonces (Phase 5b)
 *                • Emploi du temps (Phase 5c)
 *   COMMUNAUTÉ — Preview:
 *                • Annuaire des parents
 *
 * This tab is rendered by ParentApp, one at a time per active child.
 * When the parent switches child (multi-child case), this whole
 * subtree re-renders with the new ids.
 */

import { motion } from 'framer-motion'
import { HeartHandshake } from 'lucide-react'

import { HeuresColleWidget } from '@/routes/_shared/colles/HeuresColleWidget'
import { AnnoncesWidget } from '@/routes/_shared/annonces/AnnoncesWidget'
import { CoursDuJourWidget } from '@/routes/_shared/emploi/CoursDuJourWidget'
import { PaiementWidget } from '@/routes/_shared/PaiementWidget'
import { CivismeParentWidget } from '@/routes/_shared/civisme/CivismeParentWidget'
import { BilanAnnuelWidget } from '@/routes/_shared/BilanAnnuelWidget'
import { AnnuaireParentWidget } from '@/routes/_shared/annuaire/AnnuaireParentWidget'
import { VisioParentWidget } from '@/routes/_shared/visio/VisioParentWidget'
import { useGreeting } from '@/hooks/useGreeting'

interface ParentAccueilTabProps {
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  anneeScolaire?: string
  onNavigateToEmploi?: () => void
  onNavigateToPaiement?: () => void
}

export function ParentAccueilTab({
  classeId,
  classeNom,
  eleveId,
  eleveName,
  anneeScolaire,
  onNavigateToEmploi,
  onNavigateToPaiement,
}: ParentAccueilTabProps) {
  const { greeting } = useGreeting()

  const firstName = (eleveName.split(/\s+/)[0] ?? eleveName).trim()

  return (
    <div className="relative overflow-hidden">
      {/* Hero backdrop — parent version uses a softer gold tint to
          visually distinguish from the élève's navy/blue hero */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[260px] -z-10 bg-gradient-to-b from-gold/[0.07] via-gold/[0.02] to-transparent"
      />
      <div
        aria-hidden
        className="absolute right-0 top-[60px] -z-10 opacity-[0.05] translate-x-8"
      >
        <HeartHandshake className="h-72 w-72 text-navy" strokeWidth={1.2} />
      </div>

      <div className="px-4 sm:px-6 max-w-3xl mx-auto pt-6 pb-8 space-y-5">
        {/* Parent-framed greeting */}
        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-[0.65rem] uppercase tracking-[0.2em] font-bold text-gold-dark mb-1.5">
            Espace parent
          </p>
          <h1 className="font-display text-[1.65rem] sm:text-[1.9rem] text-navy font-bold leading-[1.15]">
            {greeting} 👋
          </h1>
          <p className="text-[0.95rem] text-ink-700 mt-1.5 leading-snug">
            Voici le résumé de{' '}
            <span className="font-bold text-navy">{firstName}</span>
            <span className="text-ink-400"> · {classeNom}</span>
            {anneeScolaire && (
              <span className="text-ink-400"> · Année {anneeScolaire}</span>
            )}
          </p>
        </motion.header>

        {/* Bilan annuel — only renders once the PP closes the year.
            Top of the page so the parent sees the final verdict first. */}
        <BilanAnnuelWidget
          classeId={classeId}
          eleveId={eleveId}
          eleveName={eleveName}
        />

        {/* ─── Suivi scolaire (live) ─── */}
        <section className="pt-2 space-y-3">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1">
            Suivi scolaire
          </p>
          <CoursDuJourWidget
            classeId={classeId}
            onOpenEmploi={onNavigateToEmploi}
          />
          <HeuresColleWidget classeId={classeId} eleveId={eleveId} parentMode />
        </section>

        {/* ─── Vie de l'école (preview — modules ship as we go) ─── */}
        <section className="pt-2 space-y-3">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1">
            Vie de l'école
          </p>
          <AnnoncesWidget classeIds={[classeId]} />
          <PaiementWidget
            classeId={classeId}
            eleveId={eleveId}
            onOpen={onNavigateToPaiement}
          />
          <CivismeParentWidget classeId={classeId} eleveId={eleveId} />
          <VisioParentWidget eleveId={eleveId} eleveName={eleveName} />
        </section>

        {/* ─── Communauté ─── */}
        <section className="pt-2 space-y-3">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ink-500 font-bold px-1">
            Communauté
          </p>
          <AnnuaireParentWidget
            eleveId={eleveId}
            classeId={classeId}
            eleveName={eleveName}
          />
        </section>
      </div>
    </div>
  )
}