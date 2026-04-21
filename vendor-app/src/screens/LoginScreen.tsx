/**
 * Vendor · Screen 3 — Login.
 *
 * Email + password auth against the current school's Firebase Auth.
 * Uses the Firebase app instance held in session (already initialized
 * by pickSchool). On success, session transitions to 'active'.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { ArrowLeft, Lock, Mail, LogIn, AlertCircle } from 'lucide-react'
import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'

export function LoginScreen() {
  const { phase, completeAuth, switchSchool } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  // Focus email on mount
  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  // We only render when phase is 'auth' (router guarantees this) but
  // narrow defensively in case of re-render timing.
  if (phase.kind !== 'auth') return null
  const { school, firebase } = phase

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Veuillez saisir votre email et votre mot de passe.')
      return
    }

    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(
        firebase.auth,
        email.trim(),
        password
      )
      completeAuth(cred.user)
    } catch (err) {
      console.error('[login] failed:', err)
      // Firebase Auth error messages are technical. Translate the common
      // ones so vendors see something human.
      const code = (err as { code?: string })?.code ?? ''
      setError(
        code === 'auth/invalid-credential' ||
          code === 'auth/wrong-password' ||
          code === 'auth/user-not-found'
          ? 'Email ou mot de passe incorrect.'
          : code === 'auth/too-many-requests'
            ? "Trop d'essais. Patientez quelques minutes."
            : code === 'auth/network-request-failed'
              ? 'Connexion internet interrompue. Réessayez.'
              : 'Connexion impossible. Vérifiez vos identifiants.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={switchSchool}
        className="inline-flex items-center gap-1.5 text-[0.8rem] text-ink-500 hover:text-navy mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Changer d'école
      </button>

      <div className="rounded-xl bg-white border-[1.5px] border-ink-100 shadow-xs overflow-hidden">
        <div className="px-5 py-5 border-b border-ink-100 bg-gradient-to-br from-info-bg to-white">
          <p className="text-[0.68rem] uppercase tracking-widest font-bold text-navy mb-1">
            Connexion
          </p>
          <h1 className="font-display text-xl font-bold text-navy tracking-tight leading-tight">
            {school.name}
          </h1>
          <p className="text-[0.78rem] text-ink-500 mt-1 font-mono">
            {school.config.projectId}
          </p>
        </div>

        <form onSubmit={handleLogin} className="px-5 py-5 space-y-4">
          <Input
            ref={emailRef}
            type="email"
            label="Email développeur"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail />}
            autoComplete="email"
            disabled={loading}
          />
          <Input
            type="password"
            label="Mot de passe"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock />}
            autoComplete="current-password"
            disabled={loading}
          />

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg/60 px-3 py-2.5">
              <AlertCircle
                className="h-4 w-4 text-danger shrink-0 mt-0.5"
                aria-hidden
              />
              <p className="text-[0.8rem] text-danger-dark">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            icon={<LogIn />}
            loading={loading}
            fullWidth
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>

      <p className="text-[0.72rem] text-ink-400 mt-4 text-center leading-relaxed">
        Vos identifiants sont saisis à chaque session et ne sont jamais
        enregistrés dans le navigateur.
      </p>
    </div>
  )
}
