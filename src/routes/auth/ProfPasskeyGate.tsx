/**
 * RT-SC · ProfPasskeyGate (Session 4b).
 *
 * Gates the prof/caissier login page behind the school's shared
 * `passkeyProf` code. Intended to thwart the most common realistic
 * threat vector: a teacher's child (studying at the same school)
 * shoulder-surfing their parent's login to reach the prof dashboard
 * and peek at their own upcoming notes/colles.
 *
 * UX flow:
 *   1. Fresh visitor sees ONLY a "Code d'accès de l'école" field
 *   2. Correct code → gate unlocks and renders <ProfAuth />
 *   3. Wrong code → shakes + error toast, stays on gate
 *
 * Persistence:
 *   Once a code is accepted in a session, we set `sessionStorage`
 *   so the gate doesn't re-prompt on every navigation within the
 *   same tab. sessionStorage (not localStorage) so closing the tab
 *   or browser re-arms the gate. Active logged-in sessions are
 *   unaffected because the gate only renders when not authenticated.
 *
 * ─────────────────────────────────────────────────────────────
 * TODO(blaze): this check is currently CLIENT-SIDE. The code lives
 * in `/ecole/securite` and is read via a direct Firestore getDoc.
 * A motivated attacker can open devtools, call getDoc themselves,
 * and read the code. That's the known limit of a free-tier build.
 *
 * Once Blaze is activated (Session 5+), replace this component's
 * verifyCode() with a callable Cloud Function `verifyProfPasskey`
 * that:
 *   a. Accepts a candidate code from the client
 *   b. Compares against /ecole/securite server-side
 *   c. Returns a short-lived (15-min) signed HMAC token
 *   d. Client stores token in sessionStorage, passes on /login
 *   e. A scheduled Cloud Function rotates the code weekly
 *
 * That closes the F12 read and adds automatic rotation. Until then,
 * the in-browser gate still raises the bar above "child watches
 * parent type password".
 * ─────────────────────────────────────────────────────────────
 *
 * Why `sessionStorage` key includes the school's projectId (via the
 * Firebase app options): if you visit two different schools' apps
 * on the same device, we don't want a code accepted at school A to
 * unlock the gate at school B. Projects are separate Firebase apps
 * so we use the app's projectId as the scope.
 */

import { useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Shield, AlertCircle } from 'lucide-react'
import { getDoc } from 'firebase/firestore'
import { docRef, auth } from '@/firebase'
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

/** Scoped sessionStorage key so different schools don't share unlock state. */
const GATE_KEY = `rtsc.profGate.${auth.app.options.projectId ?? 'default'}`

export function ProfPasskeyGate({ children }: ProfPasskeyGateProps) {
  const { profil, hydrating } = useAuth()

  // If we have a profil, the user is already authenticated — bypass
  // the gate entirely. This is what keeps existing sessions working
  // when admin rolls the code: nobody gets kicked out.
  const alreadyAuthed = !!profil

  // Check sessionStorage for a prior unlock in this tab.
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(GATE_KEY) === '1'
    } catch {
      // Private-browsing or storage disabled — treat as locked. The
      // user will simply retype the code, which is fine.
      return false
    }
  })

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake] = useState(0)
  const toast = useToast()

  // If somehow unlocked while hydrating (e.g. sessionStorage said yes
  // but then the session expired), keep the gate transparent while
  // auth resolves.
  if (hydrating) {
    return (
      <AuthLayout title="Chargement…">
        <div className="flex items-center justify-center py-20">
          <Spinner size="md" />
        </div>
      </AuthLayout>
    )
  }

  if (alreadyAuthed || unlocked) {
    return <>{children}</>
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const candidate = code.trim()
    if (!candidate) {
      setError("Entrez le code d'accès.")
      return
    }

    setSubmitting(true)
    try {
      const snap = await getDoc(docRef(ecoleSecuriteDoc()))
      const realKey = snap.exists()
        ? (snap.data() as SecuriteConfig).passkeyProf
        : null

      if (!realKey) {
        // School hasn't set up a passkey yet. Let the visitor through
        // rather than locking admins out of their own system. This is
        // a one-time setup edge case, not a security hole: the admin
        // controls /ecole/securite and will generate a passkey the
        // first time they visit PasskeyProfPanel.
        setUnlocked(true)
        try { sessionStorage.setItem(GATE_KEY, '1') } catch { /* ignore */ }
        return
      }

      if (candidate !== realKey) {
        setError('Code incorrect.')
        setShake((n) => n + 1)
        toast.error('Code incorrect.')
        return
      }

      // Accepted.
      try { sessionStorage.setItem(GATE_KEY, '1') } catch { /* ignore */ }
      setUnlocked(true)
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
      subtitle="Entrez le code hebdomadaire communiqué par l'administration pour accéder à la page de connexion."
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
            label="Code d'accès de l'école"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            autoFocus
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
              Code expiré ? Demandez le nouveau à votre administrateur.
              Le code change chaque semaine.
            </p>
          </div>
        </div>
      </motion.div>
    </AuthLayout>
  )
}
