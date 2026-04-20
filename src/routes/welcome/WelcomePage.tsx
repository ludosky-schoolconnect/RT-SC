/**
 * RT-SC · Welcome page (role selection) — REDESIGNED.
 *
 * Above the role cards:
 *   - Time-aware greeting (Bonjour / Bon après-midi / Bonsoir)
 *   - Today's date (Bénin local)
 *   - School identity card (nom + ville + devise) from /ecole/config
 *   - Live stats strip: classes, élèves, professeurs (animated count-up)
 *
 * Counts use Firestore's getCountFromServer (1 read per collection,
 * regardless of how many docs).
 */

import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import {
  ShieldCheck,
  GraduationCap,
  BookOpen,
  Users,
  ChevronRight,
  ClipboardSignature,
  Building2,
  School as SchoolIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useSchoolStats } from '@/hooks/useSchoolStats'
import { useGreeting } from '@/hooks/useGreeting'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'

interface RoleCardProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
  variant?: 'default' | 'admin'
}

function RoleCard({ to, icon, title, description, variant = 'default' }: RoleCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <Link
        to={to}
        className={cn(
          'group flex items-center gap-4 p-5 rounded-lg border backdrop-blur-md',
          'transition-colors duration-200 ease-out-soft',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40',
          variant === 'admin'
            ? 'bg-navy-dark/40 border-white/10 hover:border-white/20'
            : 'bg-white/[0.06] border-white/10 hover:border-gold/40 hover:bg-white/[0.10]'
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md border',
            variant === 'admin'
              ? 'bg-navy/50 border-white/10 text-white/70'
              : 'bg-gold/15 border-gold/25 text-gold-light'
          )}
          style={{ width: 52, height: 52 }}
        >
          <span className="h-[22px] w-[22px]">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base text-white font-semibold">
            {title}
          </h3>
          <p className="text-[0.78rem] text-white/55 leading-snug mt-0.5">
            {description}
          </p>
        </div>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-white/30 group-hover:text-white/60 transition-colors"
          aria-hidden
        />
      </Link>
    </motion.div>
  )
}

interface StatPillProps {
  icon: React.ReactNode
  label: string
  value: number | undefined
  loading: boolean
}

function StatPill({ icon, label, value, loading }: StatPillProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-2 py-3 rounded-md bg-white/[0.04] border border-white/10 min-w-0 flex-1">
      <span className="text-gold-light mb-1.5" aria-hidden>
        {icon}
      </span>
      <span className="font-display text-2xl font-bold text-white tabular-nums leading-none">
        {loading || value === undefined ? (
          <span className="inline-block w-8 h-6 bg-white/10 rounded animate-pulse" />
        ) : (
          <CountUp end={value} duration={1.4} />
        )}
      </span>
      <span className="mt-1 text-[0.65rem] uppercase tracking-[0.12em] text-white/55 font-semibold">
        {label}
      </span>
    </div>
  )
}

export default function WelcomePage() {
  const { data: config } = useEcoleConfig()
  const { data: stats, isLoading: statsLoading } = useSchoolStats()
  const { greeting, today } = useGreeting()

  return (
    <div
      className="min-h-dvh flex flex-col bg-navy"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,168,76,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 100% 100%, rgba(26,58,107,0.5) 0%, transparent 70%)',
      }}
    >
      <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto px-5 pt-8 pb-6">
        {/* Brand header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-6"
        >
          <div className="inline-flex items-center gap-3 mb-2">
            <SchoolConnectLogo size={44} animate={false} />
            <span className="font-display text-xl text-white font-semibold tracking-tight">
              SchoolConnect
            </span>
          </div>
        </motion.header>

        {/* Greeting + date */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-center mb-5"
        >
          <p className="text-[0.7rem] uppercase tracking-[0.18em] text-gold-light/80 font-semibold mb-1">
            {today}
          </p>
          <h1 className="font-display text-2xl text-white font-bold tracking-tight">
            {greeting}.
          </h1>
        </motion.div>

        {/* School identity card */}
        {config && (config.nom || config.ville || config.devise) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="rounded-lg border border-white/10 bg-white/[0.05] backdrop-blur-md p-4 mb-4 text-center"
          >
            {config.nom && (
              <p className="font-display text-lg text-white font-bold tracking-tight">
                {config.nom}
              </p>
            )}
            {config.ville && (
              <p className="inline-flex items-center gap-1.5 mt-0.5 text-[0.78rem] text-white/65">
                <Building2 className="h-3.5 w-3.5 text-gold-light" aria-hidden />
                {config.ville}
              </p>
            )}
            {config.devise && (
              <p className="mt-2 text-[0.78rem] text-white/55 italic font-display">
                « {config.devise} »
              </p>
            )}
          </motion.div>
        )}

        {/* Live stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="grid grid-cols-3 gap-2 mb-6"
        >
          <StatPill
            icon={<SchoolIcon className="h-4 w-4" />}
            label="Classes"
            value={stats?.classes}
            loading={statsLoading}
          />
          <StatPill
            icon={<GraduationCap className="h-4 w-4" />}
            label="Élèves"
            value={stats?.eleves}
            loading={statsLoading}
          />
          <StatPill
            icon={<BookOpen className="h-4 w-4" />}
            label="Professeurs"
            value={stats?.professeurs}
            loading={statsLoading}
          />
        </motion.div>

        {/* Role selection */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.07, delayChildren: 0.4 } },
          }}
          className="flex flex-col gap-3"
        >
          {[
            <RoleCard
              key="prof"
              to="/auth/prof"
              icon={<BookOpen className="h-full w-full" />}
              title="Professeur"
              description="Gérer les notes, l'appel et les annonces de mes classes."
            />,
            <RoleCard
              key="eleve"
              to="/auth/eleve"
              icon={<GraduationCap className="h-full w-full" />}
              title="Élève"
              description="Consulter mes notes, mes absences et mon emploi du temps."
            />,
            <RoleCard
              key="admin"
              to="/auth/admin"
              icon={<ShieldCheck className="h-full w-full" />}
              title="Administration"
              description="Pilotage de l'établissement et gestion globale."
              variant="admin"
            />,
          ].map((card, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
              }}
            >
              {card}
            </motion.div>
          ))}
        </motion.div>

        {/* Secondary actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="mt-6 grid grid-cols-2 gap-3"
        >
          <Link
            to="/auth/parent"
            className="flex items-center gap-2 px-4 py-3 rounded-md border border-white/10 bg-white/[0.04] text-[0.8125rem] text-white/75 hover:text-white hover:border-white/20 transition-colors min-h-touch"
          >
            <Users className="h-4 w-4 shrink-0 text-gold-light" aria-hidden />
            Espace parents
          </Link>
          <Link
            to="/inscription"
            className="flex items-center gap-2 px-4 py-3 rounded-md border border-white/10 bg-white/[0.04] text-[0.8125rem] text-white/75 hover:text-white hover:border-white/20 transition-colors min-h-touch"
          >
            <ClipboardSignature className="h-4 w-4 shrink-0 text-gold-light" aria-hidden />
            Pré-inscription
          </Link>
        </motion.div>

        {/* Footer */}
        <footer className="mt-auto pt-6 text-center text-[0.7rem] text-white/30 tracking-wide">
          © {new Date().getFullYear()} · SchoolConnect
          {config?.anneeActive && (
            <span className="ml-2 text-white/40">· Année {config.anneeActive}</span>
          )}
        </footer>
      </div>
    </div>
  )
}
