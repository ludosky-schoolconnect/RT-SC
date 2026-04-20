/**
 * RT-SC · Admin login.
 *
 * Email + password login. After successful Firebase sign-in, the AuthProvider's
 * snapshot of professeurs/{uid} fires and writes the profil into the auth store.
 *
 * Once `profil.role === 'admin'`, the useEffect here navigates to /admin.
 * If the role is wrong (e.g. user logged into the prof flow with their admin
 * credentials, or vice versa), we sign out and show an error.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { auth } from '@/firebase'
import { useAuth } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { translateAuthError } from '@/lib/auth-errors'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ForgotPasswordModal } from '@/components/ui/ForgotPasswordModal'

export default function AdminLogin() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profil, hydrating } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  // After a successful sign-in, when the auth store updates we either
  // forward to the dashboard or reject (wrong role).
  useEffect(() => {
    if (hydrating) return
    if (!profil) return

    if (profil.role === 'admin') {
      toast.success(`Bienvenue, ${profil.nom.split(' ')[0]}.`)
      navigate('/admin', { replace: true })
    } else {
      // Logged-in user is not an admin — bounce them out.
      void signOut(auth)
      setError("Ce compte n'a pas les droits d'administration.")
    }
  }, [profil, hydrating, navigate, toast])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      setError('Veuillez remplir email et mot de passe.')
      return
    }

    setSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password)
      // Don't navigate from here — wait for the auth observer to confirm role.
    } catch (err) {
      setError(translateAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      kicker="Administration"
      title="Connexion"
      subtitle="Accédez à l'espace de pilotage de l'établissement."
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="vous@exemple.bj"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          leading={<Mail className="h-4 w-4" />}
        />
        <Input
          label="Mot de passe"
          type={showPwd ? 'text' : 'password'}
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          autoComplete="current-password"
          leading={<Lock className="h-4 w-4" />}
          trailing={
            <IconButton
              aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              onClick={() => setShowPwd((v) => !v)}
              variant="ghost"
              className="h-8 w-8"
              type="button"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </IconButton>
          }
          error={error ?? undefined}
        />

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          Se connecter
        </Button>
      </form>

      <p className="mt-5 text-center text-[0.8125rem]">
        <button
          type="button"
          onClick={() => setForgotOpen(true)}
          className="text-navy font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded px-1"
        >
          Mot de passe oublié ?
        </button>
      </p>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
      />
    </AuthLayout>
  )
}
