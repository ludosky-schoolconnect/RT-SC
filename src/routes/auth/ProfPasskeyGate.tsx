/**
 * RT-SC · ProfPasskeyGate (Session 4b, updated in Session E2).
 *
 * Gates access to the prof/caissier area behind a passkey check on
 * every fresh browser tab. Intended to thwart the common realistic
 * threat vector: a teacher's phone or laptop being used by someone
 * else (child at the same school, family member, borrowed device)
 * while the Firebase Auth session is still valid. Firebase Auth
 * persists for days/weeks via IndexedDB — the gate adds a
 * per-tab "prove you're physically in control right now" challenge.
 *
 * ─── IMPORTANT: gate applies to authenticated users too ────
 *
 * The gate does NOT auto-bypass when the user is already logged in.
 * A fresh tab with a valid Firebase Auth session still prompts for
 * the passkey. Only within the SAME tab is the prompt suppressed
 * (via sessionStorage) for the 4-hour TTL. This is deliberate: if
 * we skipped the challenge whenever Firebase Auth was valid, the
 * gate would be useless against the actual "lost/shared device"
 * threat model.
 *
 * ─── Two verification modes, chosen at runtime ──────────────
 *
 * **Post-Blaze (preferred)**: email + per-prof passkey, verified
 * server-side via the `verifyProfLogin` callable. The callable
 * returns an HMAC-signed token (4h TTL) we stash in sessionStorage.
 * Version-bumping a prof's passkey invalidates any outstanding tokens.
 *
 * **Pre-Blaze (fallback)**: the legacy school-wide `passkeyProf`
 * check. The callable throws `functions/not-found` or
 * `functions/unavailable` when no functions are deployed; we catch
 * that and compare against /ecole/securite directly, preserving the
 * pre-E behavior. On Blaze deploy day the primary path starts
 * working silently — no client redeploy needed beyond this commit.
 *
 * UX flow:
 *   1. Fresh tab visitor sees email + passkey fields (even if already authed)
 *   2. Correct combination → gate unlocks + renders protected content
 *   3. Wrong → shake + generic error (no enumeration of registered emails)
 *
 * Persistence:
 *   On success, sessionStorage stores { token?, expiresAt, mode }
 *   scoped by projectId. Closed tab = re-arm. 4h TTL as a safety
 *   floor even for long-running tabs.
 *
 * ─── Why keep the legacy fallback ────────────────────────
 *
 * Pre-Blaze, the only way through the gate is the school-wide passkey
 * (which is what today's production already uses). Removing it would
 * brick the gate for every school until Blaze activation. Keeping it
 * means zero-downtime rollout: deploy this client now, activate Blaze
 * whenever convenient. Post-Blaze, the legacy branch becomes dead
 * code — remove in a later cleanup session once the server path is
 * proven stable.
 */

import { useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Shield, AlertCircle } from 'lucide-react'
import { getDoc } from 'firebase/firestore'
import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { docRef, auth, functions } from '@/firebase'
import { ecoleSecuriteDoc } from '@/lib/firestore-keys'
import { useAuth } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { SecuriteConfig } from '@/types/models'

interface ProfPasskeyGateProps {
  children: ReactNode
}

interface GateUnlock {
  mode: 'server' | 'legacy'
  expiresAt: number
  token?: string
  uid?: string
}

const GATE_KEY = `rtsc.profGate.${auth.app.options.projectId ?? 'default'}`

function readGate(): GateUnlock | null {
  try {
    const raw = sessionStorage.getItem(GATE_KEY)
    if (!raw) return null
    // Backwards-compat with the Session 4b bare "1" marker
    if (raw === '1') return { mode: 'legacy', expiresAt: Infinity }
    const parsed = JSON.parse(raw) as GateUnlock
    if (typeof parsed.expiresAt !== 'number') return null
    if (Date.now() > parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

function writeGate(u: GateUnlock): void {
  try {
    sessionStorage.setItem(GATE_KEY, JSON.stringify(u))
  } catch {
    /* private browsing / storage blocked — non-critical */
  }
}

interface VerifyLoginInput {
  email: string
  passkey: string
}
interface VerifyLoginOutput {
  token: string
  uid: string
  expiresAt: number
}

export function ProfPasskeyGate({ children }: ProfPasskeyGateProps) {
  const { hydrating } = useAuth()

  const [unlocked, setUnlocked] = useState<boolean>(() => readGate() !== null)

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake] = useState(0)
  const toast = useToast()

  if (hydrating) {
    return (
      <AuthLayout title="Chargement…">
        <div className="flex items-center justify-center py-20">
          <Spinner size="md" />
        </div>
      </AuthLayout>
    )
  }

  // Session E2 (hardened) — the gate challenges on every fresh tab,
  // INCLUDING authenticated users. This is deliberate: the threat
  // model is "someone else has physical access to the prof's phone
  // while the Firebase Auth session is still valid" (lost phone,
  // family member, etc.). Auto-bypassing authenticated users would
  // defeat the entire point of the gate.
  //
  // Within a single tab, once the gate is unlocked it stays unlocked
  // until the tab closes or the 4h TTL expires — so a prof who just
  // logged in isn't re-prompted on every route change. sessionStorage
  // (not localStorage) ensures tab death re-arms the gate.
  if (unlocked) {
    return <>{children}</>
  }

  async function verifyLegacy(candidate: string): Promise<void> {
    const snap = await getDoc(docRef(ecoleSecuriteDoc()))
    const realKey = snap.exists()
      ? (snap.data() as SecuriteConfig).passkeyProf
      : null

    if (!realKey) {
      // No passkey set yet — first-run admin bootstrap. Let them in.
      writeGate({ mode: 'legacy', expiresAt: Date.now() + 4 * 60 * 60_000 })
      setUnlocked(true)
      return
    }

    if (candidate !== realKey) {
      setError('Code incorrect.')
      setShake((n) => n + 1)
      toast.error('Code incorrect.')
      return
    }

    writeGate({ mode: 'legacy', expiresAt: Date.now() + 4 * 60 * 60_000 })
    setUnlocked(true)
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const candidateCode = code.trim()
    const candidateEmail = email.trim().toLowerCase()

    if (!candidateCode) {
      setError('Entrez votre code personnel.')
      return
    }

    setSubmitting(true)
    try {
      // Primary path: server callable (post-Blaze). Only attempt
      // if user supplied an email — empty email means they're using
      // the legacy school-wide code intentionally.
      if (candidateEmail) {
        try {
          const call = httpsCallable<VerifyLoginInput, VerifyLoginOutput>(
            functions,
            'verifyProfLogin'
          )
          const res = await call({
            email: candidateEmail,
            passkey: candidateCode,
          })
          const { token, uid, expiresAt } = res.data
          writeGate({ mode: 'server', expiresAt, token, uid })
          setUnlocked(true)
          return
        } catch (err) {
          const errCode = (err as FunctionsError)?.code
          if (
            errCode === 'functions/not-found' ||
            errCode === 'functions/unavailable' ||
            errCode === 'functions/internal'
          ) {
            // Blaze not deployed yet — fall through to legacy
          } else if (errCode === 'functions/unauthenticated') {
            setError('Email ou code incorrect.')
            setShake((n) => n + 1)
            toast.error('Email ou code incorrect.')
            return
          } else if (errCode === 'functions/resource-exhausted') {
            setError('Trop de tentatives. Réessayez dans quelques minutes.')
            toast.error('Trop de tentatives — patientez.')
            return
          } else if (errCode === 'functions/permission-denied') {
            setError("Votre compte n'est pas actif.")
            toast.error("Compte inactif — contactez l'administration.")
            return
          } else if (errCode === 'functions/failed-precondition') {
            // Active prof but no passkey — fall back to legacy
          } else {
            console.warn('[ProfPasskeyGate] callable error, falling back:', err)
          }
        }
      }

      // Fallback: legacy school-wide passkey
      await verifyLegacy(candidateCode)
    } catch (err) {
      console.error('[ProfPasskeyGate] verify error:', err)
      setError('Erreur réseau — réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      kicker="Accès personnel"
      title="Code d'accès requis"
      subtitle="Entrez votre email et votre code personnel. Si votre école utilise encore un code unique, laissez le champ email vide."
    >
      <motion.div
        key={shake}
        initial={shake > 0 ? { x: 0 } : false}
        animate={shake > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-center mb-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy text-gold shadow-sm">
            <Shield className="h-6 w-6" aria-hidden />
          </div>
        </div>

        <form onSubmit={verifyCode} className="space-y-4">
          <Input
            label="Email (optionnel pendant la transition)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@ecole.bj"
            type="email"
            autoComplete="email"
            inputMode="email"
            disabled={submitting}
          />

          <Input
            label="Code d'accès"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            autoFocus={!email}
            inputMode="text"
            autoComplete="off"
            maxLength={12}
            error={error ?? undefined}
            disabled={submitting}
          />

          <Button
            type="submit"
            loading={submitting}
            className="w-full"
          >
            Continuer
          </Button>
        </form>

        <div className="mt-5 rounded-md bg-ink-50/60 border border-ink-100 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-ink-400 mt-0.5" aria-hidden />
            <p className="text-[0.78rem] text-ink-500 leading-snug">
              Chaque professeur a son propre code personnel après activation
              de son compte. Code oublié ? Demandez à l'administration de le
              régénérer, ou utilisez le code unique de l'école si vous êtes
              dans la période de transition.
            </p>
          </div>
        </div>
      </motion.div>
    </AuthLayout>
  )
}
