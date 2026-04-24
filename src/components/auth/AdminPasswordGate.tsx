/**
 * RT-SC · AdminPasswordGate
 *
 * Same role as PersonnelCodeGate, but for the admin role.
 * Admin accounts use a Firebase Auth email+password — they have no
 * personal 6-digit passkey — so we re-authenticate with
 * reauthenticateWithCredential instead of calling verifyProfLogin.
 *
 * On success we write the same sessionStorage gate entry that
 * InactivityGuard and hasValidUnlock() rely on, so the 4-hour
 * same-tab bypass and the inactivity lock work identically to the
 * prof flow.
 */

import { useState, type ReactNode, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Shield, Lock, Eye, EyeOff } from 'lucide-react'
import { reauthenticateWithCredential, EmailAuthProvider, signOut } from 'firebase/auth'
import { auth } from '@/firebase'
import { useAuth } from '@/stores/auth'
import { hasValidUnlock, writePersonnelGate } from '@/lib/profPasskey'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'

interface Props {
  children: ReactNode
}

export function AdminPasswordGate({ children }: Props) {
  const { profil } = useAuth()

  const [unlocked, setUnlocked] = useState<boolean>(() => hasValidUnlock())
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake] = useState(0)

  if (unlocked) return <>{children}</>

  const userEmail = profil?.email ?? ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!password.trim()) {
      setError('Entrez votre mot de passe.')
      return
    }

    const currentUser = auth.currentUser
    if (!currentUser || !userEmail) {
      setError('Session corrompue. Veuillez vous reconnecter.')
      return
    }

    setSubmitting(true)
    try {
      const credential = EmailAuthProvider.credential(userEmail, password)
      await reauthenticateWithCredential(currentUser, credential)
      writePersonnelGate(currentUser.uid)
      setUnlocked(true)
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        setError('Mot de passe incorrect.')
      } else if (code === 'auth/too-many-requests') {
        setError('Trop de tentatives. Réessayez plus tard.')
      } else {
        setError('Erreur réseau — réessayez.')
      }
      setShake((n) => n + 1)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth)
    } catch (err) {
      console.error('[AdminPasswordGate] signOut failed:', err)
    }
  }

  return (
    <AuthLayout
      kicker="Administration"
      title="Accès requis"
      subtitle="Confirmez votre mot de passe pour accéder au tableau de bord."
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
            label="Mot de passe"
            type={showPwd ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            autoComplete="current-password"
            autoFocus
            leading={<Lock className="h-4 w-4" />}
            trailing={
              <IconButton
                aria-label={showPwd ? 'Masquer' : 'Afficher'}
                onClick={() => setShowPwd((v) => !v)}
                variant="ghost"
                className="h-8 w-8"
                type="button"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
            }
            error={error ?? undefined}
            disabled={submitting}
          />

          <Button type="submit" loading={submitting} fullWidth size="lg">
            Continuer
          </Button>
        </form>

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
