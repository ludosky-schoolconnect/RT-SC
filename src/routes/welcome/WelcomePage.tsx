/**
 * RT-SC · Welcome page (role selection) — EDITORIAL REDESIGN.
 *
 * Design intent: feels like visiting a prestigious school's official
 * website, not a SaaS login. Full-bleed photo hero with school
 * identity, then editorial numbered role list, stats as italic prose.
 *
 * Data sources (unchanged):
 *   - useEcoleConfig() — nom, ville, devise, anneeActive from /ecole/config
 *   - useSchoolStats() — classes / élèves counts (professeurs omitted
 *     because /professeurs rules require auth, and the welcome page
 *     is pre-auth)
 *   - useGreeting()    — time-aware "Bonjour" / "Bon après-midi" / "Bonsoir"
 *
 * Routes preserved: /auth/personnel, /auth/eleve, /auth/admin,
 * /auth/parent, /inscription. No downstream changes.
 *
 * Assets:
 *   - /welcome-hero.webp (48 KB, primary)
 *   - /welcome-hero.jpg  (114 KB, fallback for browsers without webp)
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useSchoolStats } from '@/hooks/useSchoolStats'
import { useGreeting } from '@/hooks/useGreeting'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'

const ROLE_ITEMS = [
  {
    to: '/auth/personnel',
    number: '01',
    title: "Personnel de l'école",
    description: 'Professeurs et caissiers — accéder à mon espace de travail.',
    primary: true,
  },
  {
    to: '/auth/eleve',
    number: '02',
    title: 'Élève',
    description: 'Mes notes, mes absences et mon emploi du temps.',
    primary: false,
  },
  {
    to: '/auth/admin',
    number: '03',
    title: 'Administration',
    description: "Pilotage de l'établissement et gestion globale.",
    primary: false,
  },
] as const

export default function WelcomePage() {
  const { data: config } = useEcoleConfig()
  const { data: stats, isLoading: statsLoading } = useSchoolStats()
  const { greeting, today } = useGreeting()

  // Dynamic crest letter from school name (admin-editable via
  // ecole/config.nom). Falls back to a dot if not loaded.
  const crestLetter = useMemo(() => {
    const nom = config?.nom?.trim()
    if (!nom) return '·'
    return nom.charAt(0).toUpperCase()
  }, [config?.nom])

  const schoolName = config?.nom || 'Établissement scolaire'
  const ville = config?.ville || ''
  const devise = config?.devise?.trim() || ''

  // Format "MERCREDI 22 AVRIL 2026" — full date in small caps for the
  // hero top bar. Matches real school letterhead dating.
  const heroDate = useMemo(() => today.toUpperCase(), [today])

  return (
    <div className="min-h-dvh bg-navy-dark text-white">
      {/* ═══════════════════════════════════════════════════════
          HERO — full-bleed school identity
          ═══════════════════════════════════════════════════════ */}
      <header className="relative h-[58vh] min-h-[420px] flex flex-col overflow-hidden">
        {/* Photo with WebP/JPEG fallback */}
        <picture aria-hidden>
          <source srcSet="/welcome-hero.webp" type="image/webp" />
          <img
            src="/welcome-hero.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover z-0"
            style={{ filter: 'saturate(0.85) contrast(1.05)' }}
            loading="eager"
            fetchPriority="high"
          />
        </picture>

        {/* Overlay gradient */}
        <div
          aria-hidden
          className="absolute inset-0 z-[1]"
          style={{
            background:
              'linear-gradient(180deg, rgba(7,24,48,0.55) 0%, rgba(7,24,48,0.4) 35%, rgba(7,24,48,0.85) 80%, #071830 100%)',
          }}
        />

        {/* Top bar: brand logo + date */}
        <div className="relative z-[2] flex items-center justify-between px-5 pt-5">
          <SchoolConnectLogo size={32} animate={false} />
          <span className="text-[0.62rem] font-body font-medium tracking-[0.22em] uppercase text-white/70">
            {heroDate}
          </span>
        </div>

        {/* Hero content: crest, name, location, devise */}
        <motion.div
          className="relative z-[2] flex-1 flex flex-col items-center justify-center px-6 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Crest — dynamic letter from school name */}
          <div
            className="w-12 h-12 mb-4 rounded-full flex items-center justify-center font-display font-bold text-[1.375rem] text-gold"
            style={{
              border: '1.5px solid rgba(201,168,76,0.4)',
              background: 'rgba(201,168,76,0.1)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
            aria-hidden
          >
            {crestLetter}
          </div>

          {/* School name */}
          <h1
            className="font-display font-medium text-white mb-3 leading-[0.95]"
            style={{
              fontSize: 'clamp(2.75rem, 11vw, 4rem)',
              letterSpacing: '0.02em',
              textShadow: '0 2px 30px rgba(5,15,31,0.6)',
            }}
          >
            {schoolName}
          </h1>

          {/* Location with gold hairlines */}
          {ville && (
            <div className="flex items-center justify-center gap-3.5 mb-5">
              <span aria-hidden className="w-6 h-px bg-gold opacity-70" />
              <span className="text-[0.65rem] font-body font-medium tracking-[0.3em] uppercase text-white">
                {ville} — Bénin
              </span>
              <span aria-hidden className="w-6 h-px bg-gold opacity-70" />
            </div>
          )}

          {/* Devise — italic serif with gold typographic quotes */}
          {devise && (
            <p
              className="font-display italic text-white/95 max-w-[380px] mx-auto leading-relaxed"
              style={{ fontSize: '1.05rem' }}
            >
              <span className="text-gold/70 text-[1.6em] leading-none align-[-0.2em] mr-0.5">
                &ldquo;
              </span>
              {devise}
              <span className="text-gold/70 text-[1.6em] leading-none align-[-0.2em] ml-0.5">
                &rdquo;
              </span>
            </p>
          )}
        </motion.div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          MAIN — greeting, roles, stats, footer
          ═══════════════════════════════════════════════════════ */}
      <main className="max-w-[640px] mx-auto px-6 py-10">
        {/* Greeting block */}
        <motion.section
          className="text-center mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="text-[0.62rem] font-body font-semibold tracking-[0.35em] uppercase text-gold mb-2.5">
            Bienvenue
          </div>
          <h2
            className="font-display font-medium text-white mb-1.5 leading-none"
            style={{
              fontSize: 'clamp(2rem, 8vw, 2.75rem)',
              letterSpacing: '-0.01em',
            }}
          >
            {greeting}.
          </h2>
          <p className="font-display italic text-white/70 text-base">
            Qui êtes-vous&nbsp;?
          </p>
        </motion.section>

        {/* Role cards — editorial numbered list */}
        <motion.div
          className="mb-10"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.55 } },
          }}
        >
          {ROLE_ITEMS.map((role) => (
            <motion.div
              key={role.to}
              variants={{
                hidden: { opacity: 0, y: 14 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                },
              }}
            >
              <Link
                to={role.to}
                className={cn(
                  'group relative flex items-center gap-4 pr-3 py-5',
                  'border-b border-white/[0.08]',
                  'hover:pl-2 transition-[padding] duration-300 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:rounded',
                  role.primary && 'py-6'
                )}
              >
                {/* Number */}
                <span className="font-display font-medium text-[0.8rem] tracking-wider text-gold self-start mt-1.5 min-w-[1.75rem]">
                  {role.number}
                </span>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'font-display text-white leading-tight mb-1',
                      role.primary
                        ? 'text-[1.875rem] font-semibold'
                        : 'text-[1.5rem] font-medium'
                    )}
                  >
                    {role.title}
                  </div>
                  <div className="text-[0.78rem] text-white/65 leading-snug max-w-[300px]">
                    {role.description}
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight
                  className="h-5 w-5 text-white/25 group-hover:text-gold group-hover:translate-x-1.5 transition-all duration-300 shrink-0"
                  aria-hidden
                />
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats — italic prose sentence */}
        <motion.section
          className="text-center py-8 border-t border-b border-white/[0.08] mb-7"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          <div className="text-[0.62rem] font-body font-semibold tracking-[0.28em] uppercase text-gold mb-3">
            L'école en chiffres
          </div>
          <p
            className="font-display italic text-white/95 max-w-[440px] mx-auto leading-[1.5]"
            style={{ fontSize: '1.1rem' }}
          >
            {statsLoading || !stats ? (
              <span className="text-white/50 not-italic">Chargement…</span>
            ) : (
              <>
                Aujourd'hui,{' '}
                <StatStrong>
                  <CountUp end={stats.eleves} duration={1.4} /> élèves
                </StatStrong>{' '}
                répartis dans{' '}
                <StatStrong>
                  <CountUp end={stats.classes} duration={1.4} /> classes
                </StatStrong>
                .
              </>
            )}
          </p>
        </motion.section>

        {/* Tertiary links */}
        <div className="grid grid-cols-2 border-t border-white/[0.08] mb-4">
          <Link
            to="/auth/parent"
            className={cn(
              'text-center py-4 px-4 font-body font-medium',
              'text-[0.68rem] tracking-[0.2em] uppercase',
              'text-white/65 hover:text-gold transition-colors',
              "relative after:content-[''] after:absolute",
              'after:right-0 after:top-[25%] after:bottom-[25%]',
              'after:w-px after:bg-white/[0.08]'
            )}
          >
            Espace parents
          </Link>
          <Link
            to="/inscription"
            className={cn(
              'text-center py-4 px-4 font-body font-medium',
              'text-[0.68rem] tracking-[0.2em] uppercase',
              'text-white/65 hover:text-gold transition-colors'
            )}
          >
            Pré-inscription
          </Link>
        </div>

        {/* Legal */}
        <div className="text-center text-[0.58rem] font-body tracking-[0.2em] uppercase text-white/25 py-3">
          © {new Date().getFullYear()} <Dot /> SchoolConnect
          {config?.anneeActive && (
            <>
              {' '}
              <Dot /> Année {config.anneeActive}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// ───────────────────────────────────────────────────────
// Small inline helpers
// ───────────────────────────────────────────────────────

function StatStrong({ children }: { children: React.ReactNode }) {
  return (
    <strong className="not-italic font-semibold text-gold font-display">
      {children}
    </strong>
  )
}

function Dot() {
  return <span className="text-gold/40 mx-1">·</span>
}
