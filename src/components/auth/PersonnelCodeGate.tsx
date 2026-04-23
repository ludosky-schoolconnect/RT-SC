/**
 * RT-SC · PersonnelCodeGate (Session E7).
 *
 * Wraps the prof / caissier / admin dashboard areas. On every fresh
 * browser tab, challenges the user for their personal 6-digit code
 * before rendering the dashboard — even if their Firebase Auth
 * session is still valid (Firebase Auth persists for days/weeks
 * via IndexedDB, so a fresh tab opened on a borrowed/forgotten
 * device wouldn't need a password by default).
 *
 * ─── Why this exists (Session E7 background) ─────────────────
 *
 * Pre-E6, ProfPasskeyGate wrapped the LOGIN ROUTE. That stopped
 * unauthenticated users at the door, but it ALSO blocked signup
 * (a brand-new prof has no code yet — they can't pass their own
 * gate). E6 moved the code check inline into the login form,
 * fixing signup, but accidentally lost the "fresh tab challenges
 * authenticated users too" property: if Firebase Auth was already
 * valid, the user would skip the login form entirely and land
 * straight in the dashboard with no code prompt.
 *
 * E7 restores that protection by gating the DASHBOARD instead of
 * the login route. Now:
 *   - Unauth user opening login → fills email + password + code
 *     in the inline form (E6)
 *   - Auth user opening fresh tab → ProtectedRoute lets them in,
 *     PersonnelCodeGate prompts for the code, then dashboard renders
 *
 * Both paths converge on the same sessionStorage unlock record,
 * shared via src/lib/profPasskey.ts. Within the same tab, a 4-hour
 * sessionStorage TTL skips re-prompting.
 *
 * ─── Threat model ────────────────────────────────────────────
 *
 * Defends against:
 *   - Borrowed phone / shared device (someone opens a fresh tab
 *     while Firebase Auth is still active in IndexedDB)
 *   - Phone left unlocked on a desk
 *   - Family member / child curious about parent's RT-SC account
 *
 * Does NOT defend against:
 *   - Someone who knows the legitimate code (eg shoulder-surfed it)
 *     — see InactivityGuard for the periodic re-prompt that limits
 *     attack window
 *   - Sophisticated attackers who could steal the sessionStorage
 *     entry from another tab via XSS — out of scope; mitigated by
 *     CSP and standard React XSS protections
 */

import { useState, type ReactNode, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Shield, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from '@/firebase'
import { useAuth } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import {
  hasValidUnlock,
  verifyPersonalCode,
  passkeyErrorMessage,
} from '@/lib/profPasskey'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'

interface Props {
  children: ReactNode
}

export function PersonnelCodeGate({ children }: Props) {
  const { profil } = useAuth()
  const toast = useToast()

  // Initial state: read sessionStorage once. If valid, render
  // children immediately without showing the gate UI.
  const [unlocked, setUnlocked] = useState<boolean>(() => hasValidUnlock())

  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake] = useState(0)

  if (unlocked) {
    return <>{children}</>
  }

  // The user IS authenticated (ProtectedRoute already verified
  // role + statut). We have their email from `profil`. So the gate
  // only needs the code field — not email or password.
  const userEmail = profil?.email ?? ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!userEmail) {
      // This shouldn't happen — ProtectedRoute upstream guarantees
      // an authenticated user with a profil doc. Defensive fallback.
      setError('Session corrompue. Veuillez vous reconnecter.')
      return
    }
    if (!code.trim()) {
      setError('Entrez votre code personnel.')
      return
    }

    setSubmitting(true)
    const result = await verifyPersonalCode(userEmail, code.trim())
    setSubmitting(false)

    if (result.ok) {
      setUnlocked(true)
      return
    }

    setError(passkeyErrorMessage(result.reason))
    setShake((n) => n + 1)
    if (result.reason === 'rate-limited') {
      toast.error('Trop de tentatives — patientez quelques minutes.')
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth)
    } catch (err) {
      console.error('[PersonnelCodeGate] signOut failed:', err)
    }
  }

  return (
    <AuthLayout
      kicker="Accès personnel"
      title="Code d'accès requis"
      subtitle={
        userEmail
          ? `Confirmez votre identité pour accéder à votre espace.`
          : "Confirmez votre identité pour continuer."
      }
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

        {userEmail && (
          <div className="mb-4 text-center">
            <p className="text-[0.78rem] text-ink-500">Connecté en tant que</p>
            <p className="text-[0.9rem] font-semibold text-navy break-all">{userEmail}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Code d'accès personnel"
            type={showCode ? 'text' : 'password'}
            placeholder="••••••"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError(null)
            }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            autoFocus
            leading={<KeyRound className="h-4 w-4" />}
            trailing={
              <IconButton
                aria-label={showCode ? 'Masquer' : 'Afficher'}
                onClick={() => setShowCode((v) => !v)}
                variant="ghost"
                className="h-8 w-8"
                type="button"
              >
                {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
            }
            error={error ?? undefined}
            disabled={submitting}
          />

          <Button type="submit" loading={submitting} fullWidth size="lg">
            Continuer
          </Button>
        </form>

        <div className="mt-5 rounded-md bg-ink-50/60 border border-ink-100 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-ink-400 mt-0.5" aria-hidden />
            <p className="text-[0.78rem] text-ink-500 leading-snug">
              Code oublié ? Demandez à votre administrateur de le régénérer,
              ou régénérez-le depuis votre espace après reconnexion.
            </p>
          </div>
        </div>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={handleLogout}
            className="text-[0.8125rem] text-ink-400 hover:text-ink-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded px-1"
          >
            Se déconnecter
          </button>
        </div>
      </motion.div>
    </AuthLayout>
  )
}
