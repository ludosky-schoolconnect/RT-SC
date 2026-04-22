/**
 * RT-SC · Landing page (school code gate) — REDESIGNED.
 *
 * Layout:
 *   - Faint full-bleed photo of African students (Unsplash CDN), navy gradient over
 *   - Animated SchoolConnect logo + brand
 *   - Tagline explaining the school code
 *   - Code input card (glass)
 *   - Quote rotator (cycles every 10s)
 *   - "À propos" link in the footer
 *
 * Localhost dev convenience: typing any code on localhost saves and forwards
 * even if no /school_codes doc exists. (Production behavior unchanged.)
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, ArrowRight, Info } from 'lucide-react'
import { getDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { schoolCodeDoc } from '@/lib/firestore-keys'
import type { SchoolCode } from '@/types/models'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'
import { QuoteRotator } from '@/components/ui/QuoteRotator'
import { useToast } from '@/stores/toast'

const STORAGE_KEY = 'sc_school_code'

// Unsplash photo of African students in a classroom.
// Swap to your own image any time:
//   1. Drop a file at /public/landing-bg.jpg
//   2. Replace this URL with '/landing-bg.jpg'
const LANDING_BG_URL =
  'https://images.unsplash.com/photo-1497486751825-1233686d5d80?auto=format&fit=crop&w=1600&q=70'

function isCurrentHost(url: string): boolean {
  try {
    const u = new URL(url)
    return u.host === window.location.host
  } catch {
    return false
  }
}

function isLocalhost(): boolean {
  const h = window.location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.local') ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h)
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoChecking, setAutoChecking] = useState(true)

  // Skip directly to /welcome if:
  //   (a) this deployment is a SCHOOL (has /ecole/config) — this is
  //       the target deployment, not the hub. The code-entry page
  //       has no meaning here.
  //   (b) user already entered a code (stored in localStorage)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Probe /ecole/config. If it exists, this is a school — skip
        // the landing gate entirely.
        const ecoleConfig = await getDoc(docRef('ecole/config'))
        if (cancelled) return
        if (ecoleConfig.exists()) {
          navigate('/welcome', { replace: true })
          return
        }
      } catch {
        // Firestore unreachable or rules reject read — fall through
        // to normal code-entry flow (hub landing).
      }
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) navigate('/welcome', { replace: true })
      else setAutoChecking(false)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleaned = code.trim().toUpperCase()
    if (!cleaned) {
      setError("Veuillez saisir le code de votre école.")
      return
    }

    setLoading(true)
    try {
      const snap = await getDoc(docRef(schoolCodeDoc(cleaned)))

      if (!snap.exists()) {
        // Dev convenience: on localhost, accept any code so we can develop without
        // a real /school_codes/SC-XXX doc for this dev URL.
        if (isLocalhost()) {
          localStorage.setItem(STORAGE_KEY, cleaned)
          toast.info('Mode développement — code accepté localement.')
          navigate('/welcome', { replace: true })
          return
        }
        setError("Code école introuvable. Vérifiez la saisie.")
        return
      }

      const data = snap.data() as SchoolCode

      if (data.url && !isCurrentHost(data.url)) {
        // Other-school code — redirect away (production behavior)
        toast.info('Redirection vers votre établissement…')
        window.location.href = data.url
        return
      }

      localStorage.setItem(STORAGE_KEY, cleaned)
      navigate('/welcome', { replace: true })
    } catch (err) {
      console.error('[LandingPage] code lookup error:', err)
      setError("Erreur de connexion. Vérifiez votre internet.")
    } finally {
      setLoading(false)
    }
  }

  if (autoChecking) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy">
        <div className="h-2 w-32 bg-white/15 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-gold rounded-full animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh flex flex-col bg-navy overflow-hidden">
      {/* Background photo */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${LANDING_BG_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.18,
        }}
      />
      {/* Navy gradient overlay for legibility */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(7,24,48,0.85) 0%, rgba(11,37,69,0.92) 40%, rgba(11,37,69,0.98) 100%)',
        }}
      />
      {/* Gold glow */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(201,168,76,0.18) 0%, transparent 65%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col w-full max-w-md mx-auto px-5 pt-10 pb-6">
        {/* Brand header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-6"
        >
          <div className="inline-flex flex-col items-center gap-3">
            <SchoolConnectLogo size={72} />
            <span className="font-display text-[1.6rem] text-white font-semibold tracking-tight">
              SchoolConnect
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] uppercase tracking-[0.18em] text-white/50 font-light">
            Plateforme scolaire numérique
          </p>
        </motion.header>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-center text-[0.875rem] text-white/65 leading-relaxed mb-7 max-w-sm mx-auto"
        >
          Chaque établissement dispose de son propre environnement sécurisé.
          Que vous soyez membre de l'administration, professeur ou élève,
          veuillez entrer le code de votre école.
        </motion.p>

        {/* Code input card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="rounded-lg border border-white/10 bg-white/[0.06] backdrop-blur-md p-5 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gold/15 border border-gold/25 text-gold-light">
              <KeyRound className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-base text-white font-semibold">
                Code de l'école
              </h2>
              <p className="text-[0.72rem] text-white/55">
                Demandé une seule fois sur cet appareil.
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError(null)
              }}
              placeholder="SC-XXXXX-XX"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              error={error ?? undefined}
              className="text-center font-mono tracking-[0.15em] text-base bg-white"
            />
            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
              trailingIcon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              Continuer
            </Button>
          </form>
        </motion.div>

        {/* Quote rotator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-8 px-1"
        >
          <QuoteRotator />
        </motion.div>

        {/* Footer */}
        <footer className="mt-auto pt-6 flex items-center justify-between text-[0.7rem] text-white/40 tracking-wide">
          <span>© {new Date().getFullYear()} SchoolConnect</span>
          <Link
            to="/a-propos"
            className="inline-flex items-center gap-1 text-white/55 hover:text-gold-light transition-colors"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
            À propos
          </Link>
        </footer>
      </div>
    </div>
  )
}
