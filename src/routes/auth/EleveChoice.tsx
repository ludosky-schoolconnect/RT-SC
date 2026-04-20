/**
 * RT-SC · Élève entry choice.
 *
 * Two paths:
 *   1. "J'ai déjà mon code" → /auth/eleve/login
 *   2. "Première fois" → /auth/eleve/signup (identity verification)
 */

import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn, UserPlus, ChevronRight } from 'lucide-react'
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

export default function EleveChoice() {
  return (
    <AuthLayout
      kicker="Espace élève"
      title="Comment souhaitez-vous accéder ?"
      subtitle="Sélectionnez l'option qui correspond à votre situation."
    >
      <div className="space-y-3">
        <ChoiceCard
          to="/auth/eleve/login"
          icon={<LogIn className="h-5 w-5" />}
          title="J'ai déjà mon code"
          description="Code de classe à 6 caractères et code PIN personnel."
        />
        <ChoiceCard
          to="/auth/eleve/signup"
          icon={<UserPlus className="h-5 w-5" />}
          title="Première connexion"
          description="Vérifier mon identité pour récupérer le code de ma classe."
        />
      </div>
    </AuthLayout>
  )
}
