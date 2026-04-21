/**
 * RT-SC · Personnel de l'école — entry chooser.
 *
 * Staff land here after tapping "Personnel de l'école" on the Welcome
 * page. Two paths:
 *
 *   1. Professeur → `/auth/personnel/prof` (existing prof signup/login)
 *   2. Caissier   → `/auth/personnel/caisse` (new caissier flow)
 *
 * Admin uses the Professeur entry point too (admin accounts are
 * created by promoting an approved prof; there's no separate admin
 * signup surface).
 */

import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GraduationCap, Wallet, ChevronRight } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { cn } from '@/lib/cn'

interface ChoiceCardProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
}

function ChoiceCard({ to, icon, title, description }: ChoiceCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <Link
        to={to}
        className={cn(
          'group flex items-center gap-4 p-5 rounded-lg border-[1.5px] border-ink-100 bg-white shadow-xs',
          'transition-all duration-200 ease-out-soft',
          'hover:border-navy hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40'
        )}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-info-bg text-navy">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base text-navy font-semibold">
            {title}
          </h3>
          <p className="text-[0.8125rem] text-ink-600 leading-snug mt-0.5">
            {description}
          </p>
        </div>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-ink-400 group-hover:text-navy transition-colors"
          aria-hidden
        />
      </Link>
    </motion.div>
  )
}

export default function PersonnelChoice() {
  return (
    <AuthLayout
      kicker="Personnel de l'école"
      title="Quelle est votre fonction ?"
      subtitle="Sélectionnez l'espace correspondant à votre poste dans l'établissement."
    >
      <div className="space-y-3">
        <ChoiceCard
          to="/auth/personnel/prof"
          icon={<GraduationCap className="h-5 w-5" />}
          title="Professeur"
          description="Saisie des notes, appel, bulletins, annonces. Accès administration si promu."
        />
        <ChoiceCard
          to="/auth/personnel/caisse"
          icon={<Wallet className="h-5 w-5" />}
          title="Caissier"
          description="Terminal de caisse, bilan financier, guichet d'admission."
        />
      </div>
    </AuthLayout>
  )
}
