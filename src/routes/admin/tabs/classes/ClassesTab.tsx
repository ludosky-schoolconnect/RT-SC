/**
 * RT-SC · Admin → Classes tab.
 *
 * Top: stat strip (total classes, breakdown by cycle).
 * Middle: filter chips (Tout / Premier cycle / Second cycle).
 * Grid: cards for each class.
 * FAB: "Nouvelle classe" creates one via modal.
 *
 * Tap a class card → ModalClasseDetail (edit / regen passkey / delete).
 */

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Users, BookOpen, GraduationCap, AlertCircle } from 'lucide-react'

import { useClasses } from '@/hooks/useClasses'
import type { Classe } from '@/types/models'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Section, SectionHeader } from '@/components/layout/Section'
import { cn } from '@/lib/cn'

import { ClasseCard } from './ClasseCard'
import { ModalCreateClasse } from './ModalCreateClasse'
import { ModalClasseDetail } from './ModalClasseDetail'

type CycleFilter = 'tout' | 'premier' | 'second'

const FILTERS: { id: CycleFilter; label: string }[] = [
  { id: 'tout', label: 'Tout' },
  { id: 'premier', label: 'Premier cycle' },
  { id: 'second', label: 'Second cycle' },
]

export function ClassesTab() {
  const { data: classes, isLoading, error } = useClasses()
  const [filter, setFilter] = useState<CycleFilter>('tout')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailFor, setDetailFor] = useState<Classe | null>(null)

  const filtered = useMemo(() => {
    if (!classes) return []
    if (filter === 'tout') return classes
    return classes.filter((c) => c.cycle === filter)
  }, [classes, filter])

  const stats = useMemo(() => {
    const all = classes ?? []
    return {
      total: all.length,
      premier: all.filter((c) => c.cycle === 'premier').length,
      second: all.filter((c) => c.cycle === 'second').length,
    }
  }, [classes])

  return (
    <>
      <Section>
        <SectionHeader
          kicker="Établissement"
          title="Gestion des classes"
          description="Créez les classes de l'année, gérez leurs codes d'accès et assignez les professeurs principaux."
          action={
            <Button onClick={() => setCreateOpen(true)} leadingIcon={<Plus className="h-4 w-4" />}>
              Nouvelle classe
            </Button>
          }
        />

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total"
            value={stats.total}
            tone="navy"
          />
          <StatCard
            icon={<BookOpen className="h-5 w-5" />}
            label="Premier cycle"
            value={stats.premier}
            tone="info"
          />
          <StatCard
            icon={<GraduationCap className="h-5 w-5" />}
            label="Second cycle"
            value={stats.second}
            tone="serie-a"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'px-4 py-2 rounded-full text-[0.8125rem] font-semibold whitespace-nowrap',
                  'transition-all duration-150 ease-out-soft min-h-touch',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40',
                  active
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-white text-ink-600 border border-ink-100 hover:border-navy hover:text-navy'
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" label="Chargement des classes…" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-danger" />}
            title="Erreur de chargement"
            description="Impossible de charger les classes. Vérifiez votre connexion."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title={filter === 'tout' ? 'Aucune classe créée' : 'Aucune classe dans ce cycle'}
            description={
              filter === 'tout'
                ? 'Commencez par créer la première classe de votre établissement.'
                : "Changez de filtre ou créez une classe pour ce cycle."
            }
            action={
              <Button
                onClick={() => setCreateOpen(true)}
                leadingIcon={<Plus className="h-4 w-4" />}
              >
                Nouvelle classe
              </Button>
            }
          />
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
          >
            <AnimatePresence>
              {filtered.map((c, i) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.03, 0.3) } }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <ClasseCard classe={c} onClick={() => setDetailFor(c)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </Section>

      <ModalCreateClasse open={createOpen} onClose={() => setCreateOpen(false)} />
      <ModalClasseDetail classe={detailFor} onClose={() => setDetailFor(null)} />
    </>
  )
}

// ─── StatCard ───────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'navy' | 'info' | 'serie-a'
}

const TONE_CLASSES = {
  navy: 'bg-info-bg border-navy/15 text-navy',
  info: 'bg-info-bg border-navy/15 text-navy',
  'serie-a': 'bg-serie-a-bg border-serie-a/15 text-serie-a',
}

function StatCard({ icon, label, value, tone }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 flex items-center gap-3',
        TONE_CLASSES[tone]
      )}
    >
      <div className="shrink-0 opacity-90">{icon}</div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold leading-none">{value}</p>
        <p className="text-[0.7rem] uppercase tracking-wider font-bold opacity-75 mt-1">
          {label}
        </p>
      </div>
    </div>
  )
}
