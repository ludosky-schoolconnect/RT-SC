/**
 * RT-SC · ProfPasskeyGate (Session 4b, updated E2 → E4).
 *
 * Gates access to the prof/caissier area behind a per-prof passkey
 * check on every fresh browser tab. Intended to thwart the common
 * realistic threat vector: a teacher's phone or laptop being used by
 * someone else (child at the same school, family member, borrowed
 * device) while the Firebase Auth session is still valid.
 *
 * Firebase Auth persists for days/weeks via IndexedDB — the gate
 * adds a per-tab "prove you're physically in control right now"
 * challenge using a code that only the real prof knows.
 *
 * ─── The gate applies to authenticated users too ─────────────
 *
 * The gate does NOT auto-bypass when the user is already logged in.
 * A fresh tab with a valid Firebase Auth session still prompts for
 * the passkey. Only within the SAME tab is the prompt suppressed
 * (via sessionStorage) for the 4-hour TTL. This is deliberate: if
 * we skipped the challenge whenever Firebase Auth was valid, the
 * gate would be useless against the actual "lost/shared device"
 * threat model.
 *
 * ─── Session E4 — server-only, no fallback ────────────────────
 *
 * Prior to E4 the gate had a legacy fallback that compared the
 * candidate code against a school-wide `passkeyProf` field in
 * /ecole/securite when the callable was unavailable (pre-Blaze).
 * That meant:
 *   - The same code worked for every teacher, which is weak
 *   - F12 users could read /ecole/securite via getDoc() from
 *     devtools before ever typing at the gate
 *   - Rotation required telling every teacher at once
 *
 * E4 removes that fallback. The gate now accepts ONLY an email +
 * per-prof passkey pair verified server-side through the
 * `verifyProfLogin` callable. The server-side check:
 *   1. Cannot be bypassed by editing client code — the callable
 *      runs admin-SDK with its own auth decision
 *   2. Issues an HMAC-signed token with 4h expiry that the server
 *      could re-verify on sensitive operations
 *   3. Invalidates all outstanding tokens when the passkey rotates
 *      (version bump in the HMAC payload)
 *
 * Blaze must be active for this gate to function. Activation
 * instructions: see DEPLOY-ONCE-BLAZE-IS-READY.md.
 *
 * UX flow:
 *   1. Fresh tab visitor sees email + passkey fields (even if already authed)
 *   2. Correct combination → gate unlocks + renders protected content
 *   3. Wrong → shake + generic error (no enumeration of registered emails)
 *
 * Persistence:
 *   On success, sessionStorage stores { token, expiresAt, uid }
 *   scoped by projectId. Closed tab = re-arm. 4h TTL as a safety
 *   floor even for long-running tabs.
 */

import { useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Shield, AlertCircle } from 'lucide-react'
import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { auth, functions } from '@/firebase'
import { useAuth } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface ProfPasskeyGateProps {
  children: ReactNode
}

/** Server-side gate unlock record — stashed in sessionStorage. */
interface GateUnlock {
  /** HMAC-signed token from verifyProfLogin. Never used client-side
   *  for anything other than "I have one, let me through"; future
   *  server-side callables could require it in the header. */
  token: string
  uid: string
  expiresAt: number
}

const GATE_KEY = `rtsc.profGate.${auth.app.options.projectId ?? 'default'}`

function readGate(): GateUnlock | null {
  try {
    const raw = sessionStorage.getItem(GATE_KEY)
    if (!raw) return null
    // Backwards-compat with the Session 4b bare "1" marker or the
    // E2 legacy-mode JSON — both are considered expired in E4, since
    // we only accept proper server tokens now. Users with a stale
    // pre-E4 entry re-enter email + passkey once, then upgrade.
    if (raw === '1') return null
    const parsed = JSON.parse(raw) as Partial<GateUnlock> & { mode?: string }
    if (parsed.mode === 'legacy') return null
    if (typeof parsed.expiresAt !== 'number') return null
    if (typeof parsed.token !== 'string' || typeof parsed.uid !== 'string') return null
    if (Date.now() > parsed.expiresAt) return null
    return {
      token: parsed.token,
      uid: parsed.uid,
      expiresAt: parsed.expiresAt,
    }
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

  if (unlocked) {
    return <>{children}</>
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const candidateCode = code.trim()
    const candidateEmail = email.trim().toLowerCase()

    if (!candidateEmail) {
      setError('Entrez votre email.')
      return
    }
    if (!candidateCode) {
      setError('Entrez votre code personnel.')
      return
    }

    setSubmitting(true)
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
      writeGate({ token, uid, expiresAt })
      setUnlocked(true)
    } catch (err) {
      const errCode = (err as FunctionsError)?.code
      if (errCode === 'functions/unauthenticated') {
        setError('Email ou code incorrect.')
        setShake((n) => n + 1)
        toast.error('Email ou code incorrect.')
      } else if (errCode === 'functions/resource-exhausted') {
        setError('Trop de tentatives. Réessayez dans quelques minutes.')
        toast.error('Trop de tentatives — patientez.')
      } else if (errCode === 'functions/permission-denied') {
        setError("Votre compte n'est pas actif.")
        toast.error("Compte inactif — contactez l'administration.")
      } else if (errCode === 'functions/failed-precondition') {
        setError(
          "Aucun code personnel configuré. Contactez l'administration pour en recevoir un."
        )
        toast.error('Pas de code personnel — voir administrateur.')
      } else {
        console.error('[ProfPasskeyGate] verify error:', err)
        setError('Erreur réseau — réessayez.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      kicker="Accès personnel"
      title="Code d'accès requis"
      subtitle="Entrez votre email et votre code personnel à 6 chiffres."
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
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@ecole.bj"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            disabled={submitting}
          />

          <Input
            label="Code d'accès personnel"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
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
              Chaque professeur et caissier possède un code personnel à 6
              chiffres communiqué par l'administration. Code oublié ? Demandez
              à votre administrateur de le régénérer.
            </p>
          </div>
        </div>
      </motion.div>
    </AuthLayout>
  )
}
