/**
 * RT-SC · ClasseCard
 *
 * Display card for a single classe. Used in the admin Classes grid.
 * Shows: name (Playfair), niveau + cycle / série badges, passkey pill, élève count.
 * Tap → opens ModalClasseDetail.
 */

import { motion } from 'framer-motion'
import { KeyRound, Users, ChevronRight } from 'lucide-react'
import type { Classe } from '@/types/models'
import { nomClasse } from '@/lib/benin'
import { Badge } from '@/components/ui/Badge'
import { useClasseEleveCount } from '@/hooks/useClasses'
import { cn } from '@/lib/cn'

interface ClasseCardProps {
  classe: Classe
  onClick: () => void
}

const SERIE_BADGE_VARIANT = {
  A: 'serie-a',
  B: 'serie-b',
  C: 'serie-c',
  D: 'serie-d',
  G1: 'serie-d',
  G2: 'serie-d',
  G3: 'serie-d',
} as const

export function ClasseCard({ classe, onClick }: ClasseCardProps) {
  const { data: count, isLoading: loadingCount } = useClasseEleveCount(classe.id)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, boxShadow: '0 4px 20px rgba(11,37,69,0.12)' }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={cn(
        'group relative w-full text-left bg-white rounded-lg border-[1.5px] border-ink-100 p-5 overflow-hidden',
        'transition-colors duration-200 ease-out-soft',
        'hover:border-navy',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40'
      )}
    >
      {/* Top accent strip — navy → gold */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy to-gold"
      />

      {/* Header: name + serie badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
            {classe.cycle === 'premier' ? 'Premier cycle' : 'Second cycle'}
          </p>
          <h3 className="font-display text-lg font-bold text-navy tracking-tight mt-0.5">
            {nomClasse(classe)}
          </h3>
        </div>
        {classe.serie && (
          <Badge variant={SERIE_BADGE_VARIANT[classe.serie]} size="sm">
            Série {classe.serie}
          </Badge>
        )}
      </div>

      {/* Élève count */}
      <div className="flex items-center gap-1.5 text-[0.8125rem] text-ink-600 mb-3">
        <Users className="h-3.5 w-3.5 text-ink-400" aria-hidden />
        {loadingCount ? (
          <span className="text-ink-400">—</span>
        ) : (
          <>
            <span className="font-semibold text-ink-800">{count}</span>
            <span>{count === 1 ? 'élève' : 'élèves'}</span>
          </>
        )}
      </div>

      {/* Passkey pill + chevron */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-ink-100">
        <Badge variant="gold" size="sm" leadingIcon={<KeyRound className="h-3 w-3" />}>
          {classe.passkey}
        </Badge>
        <ChevronRight
          className="h-4 w-4 text-ink-400 group-hover:text-navy transition-colors"
          aria-hidden
        />
      </div>
    </motion.button>
  )
}
