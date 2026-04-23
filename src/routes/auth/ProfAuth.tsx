/**
 * RT-SC · Professeur auth.
 *
 * Tabs: Login | Inscription
 *
 * Login flow (Session E6 — inline personal code check):
 *   - User enters email + password + personal 6-digit code
 *   - Submit calls verifyProfLogin server-side FIRST (validates
 *     email matches a prof doc + code matches stored loginPasskey +
 *     rate limit)
 *   - On success, standard Firebase signInWithEmailAndPassword runs
 *   - Within the same tab, a 4h sessionStorage bypass skips the
 *     server call for repeat logins
 *   - AuthProvider detects role:
 *       * 'prof' + statut 'actif'      → /prof
 *       * 'prof' + statut 'en_attente' → ProtectedRoute redirects to /prof/en-attente
 *       * 'admin' or unknown           → sign out + error
 *
 * Signup flow (unchanged — does NOT require a personal code since
 * the prof doesn't have one yet):
 *   1. Validate the school's passkeyProf (read ecole/securite) BEFORE creating account
 *   2. createUserWithEmailAndPassword
 *   3. Write professeurs/{uid} with statut: 'en_attente'
 *   4. Show success toast — AuthProvider takes over and ProtectedRoute
 *      redirects to /prof/en-attente. Admin approves the account →
 *      onProfActivated trigger generates the prof's personal code →
 *      admin communicates it in person → prof uses it on next login.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Eye, EyeOff, Mail, Lock, User, KeyRound, BookOpen } from 'lucide-react'
import { auth, docRef } from '@/firebase'
import { ecoleSecuriteDoc, professeurDoc } from '@/lib/firestore-keys'
import { useAuth } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { translateAuthError } from '@/lib/auth-errors'
import { verifyPersonalCode, passkeyErrorMessage } from '@/lib/profPasskey'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ForgotPasswordModal } from '@/components/ui/ForgotPasswordModal'
import type { SecuriteConfig } from '@/types/models'

type Mode = 'login' | 'signup'

export default function ProfAuth() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profil, hydrating } = useAuth()
  const [mode, setMode] = useState<Mode>('login')

  // Forward authenticated profs once their profil arrives.
  // Caissier role is valid here too (no separate caissier login
  // surface — they create a prof account, admin promotes them).
  useEffect(() => {
    if (hydrating) return
    if (!profil) return

    if (profil.role === 'admin') {
      void signOut(auth)
      toast.error("Cet espace est réservé aux professeurs et caissiers.")
      return
    }

    // Caissier — route to their dedicated dashboard.
    if (profil.role === 'caissier') {
      toast.success(`Bienvenue, ${profil.nom.split(' ')[0]}.`)
      navigate('/caissier', { replace: true })
      return
    }

    if (profil.role !== 'prof') {
      void signOut(auth)
      return
    }
    // Prof — let ProtectedRoute handle the en_attente vs actif split
    if (profil.statut === 'en_attente') {
      navigate('/prof/en-attente', { replace: true })
    } else {
      toast.success(`Bienvenue, ${profil.nom.split(' ')[0]}.`)
      navigate('/prof', { replace: true })
    }
  }, [profil, hydrating, navigate, toast])

  return (
    <AuthLayout
      kicker="Professeur"
      title={mode === 'login' ? 'Connexion' : 'Créer un compte'}
      subtitle={
        mode === 'login'
          ? 'Accédez à vos classes, vos notes et l\'appel quotidien.'
          : 'Demandez le code d\'accès auprès de l\'administration.'
      }
    >
      {/* Mode switcher */}
      <div className="relative inline-flex w-full p-1 bg-ink-100 rounded-md mb-6">
        {(['login', 'signup'] as Mode[]).map((m) => {
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="relative flex-1 py-2 text-[0.875rem] font-semibold transition-colors min-h-touch"
            >
              {active && (
                <motion.span
                  layoutId="rt-sc-prof-mode"
                  className="absolute inset-0 bg-white rounded-md shadow-sm"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className={`relative z-10 ${active ? 'text-navy' : 'text-ink-400'}`}>
                {m === 'login' ? 'Connexion' : 'Inscription'}
              </span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {mode === 'login' ? <ProfLoginForm /> : <ProfSignupForm onDone={() => setMode('login')} />}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  )
}

// ─── Login form ─────────────────────────────────────────────

function ProfLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCodeError(null)

    const cleanEmail = email.trim().toLowerCase()
    const cleanCode = code.trim()
    if (!cleanEmail || !password) {
      setError('Veuillez remplir email et mot de passe.')
      return
    }
    if (!cleanCode) {
      setCodeError('Entrez votre code personnel à 6 chiffres.')
      return
    }

    setSubmitting(true)
    try {
      // Session E6 — personal code check runs BEFORE Firebase Auth.
      // The server verifies (email, code) against the stored
      // loginPasskey. On success, we proceed with the standard
      // Firebase email+password signin. If the code is wrong, we
      // don't even attempt Firebase signin (saves a round trip and
      // avoids leaking information about which emails are valid).
      //
      // A same-tab bypass skips the server call within 4h of a
      // prior successful verification — see profPasskey.ts.
      const verify = await verifyPersonalCode(cleanEmail, cleanCode)
      if (!verify.ok) {
        setCodeError(passkeyErrorMessage(verify.reason))
        setSubmitting(false)
        return
      }

      await signInWithEmailAndPassword(auth, cleanEmail, password)
      // The parent's useEffect will navigate based on profil.
    } catch (err) {
      setError(translateAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
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
      />
      <Input
        label="Code d'accès personnel"
        type="text"
        placeholder="123456"
        value={code}
        onChange={(e) => {
          setCode(e.target.value)
          setCodeError(null)
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={12}
        leading={<KeyRound className="h-4 w-4" />}
        error={codeError ?? undefined}
        hint="Code à 6 chiffres communiqué par l'administration."
      />

      <Button type="submit" fullWidth size="lg" loading={submitting}>
        Se connecter
      </Button>

      <p className="text-center text-[0.8125rem] -mt-1">
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
    </form>
  )
}

// ─── Signup form ────────────────────────────────────────────

interface SignupProps {
  onDone: () => void
}

function ProfSignupForm({ onDone }: SignupProps) {
  const toast = useToast()
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [matieres, setMatieres] = useState('')
  const [passkey, setPasskey] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleanNom = nom.trim()
    const cleanEmail = email.trim().toLowerCase()
    const matieresList = matieres
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    if (!cleanNom || !cleanEmail || password.length < 8 || !passkey) {
      setError('Veuillez remplir tous les champs (mot de passe ≥ 8 caractères).')
      return
    }
    if (matieresList.length === 0) {
      setError('Indiquez au moins une matière enseignée.')
      return
    }

    setSubmitting(true)
    try {
      // 1. Validate the school's passkey FIRST — never create an account otherwise
      const secSnap = await getDoc(docRef(ecoleSecuriteDoc()))
      const realKey =
        secSnap.exists()
          ? (secSnap.data() as SecuriteConfig).passkeyProf
          : '123456'

      if (passkey.trim() !== realKey) {
        setError("Code d'accès incorrect. Demandez le bon code à l'administration.")
        setSubmitting(false)
        return
      }

      // 2. Create the Firebase account
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password)

      // 3. Create the Firestore profile in 'en_attente'
      await setDoc(docRef(professeurDoc(cred.user.uid)), {
        nom: cleanNom,
        email: cleanEmail,
        matieres: matieresList,
        classesIds: [],
        role: 'prof',
        statut: 'en_attente',
        createdAt: serverTimestamp(),
      })

      toast.success("Compte créé. En attente d'approbation par l'administration.")
      // Parent component's useEffect will pick up the profil and navigate
      // to /prof/en-attente automatically. Clear the button spinner so
      // the user isn't staring at a loading state if the navigation
      // takes a beat.
      setSubmitting(false)
    } catch (err) {
      setError(translateAuthError(err))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        label="Nom complet"
        placeholder="DOSSA Jean"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        autoComplete="name"
        leading={<User className="h-4 w-4" />}
      />
      <Input
        label="Email"
        type="email"
        placeholder="vous@exemple.bj"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        autoCapitalize="off"
        leading={<Mail className="h-4 w-4" />}
      />
      <Input
        label="Mot de passe"
        type={showPwd ? 'text' : 'password'}
        placeholder="8 caractères minimum"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
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
      />
      <Textarea
        label="Matières enseignées"
        placeholder="Mathématiques, Physique-Chimie, …"
        value={matieres}
        onChange={(e) => setMatieres(e.target.value)}
        hint="Séparez les matières par des virgules."
        rows={2}
      />
      <Input
        label="Code d'accès professeur"
        placeholder="6 chiffres"
        value={passkey}
        onChange={(e) => setPasskey(e.target.value)}
        autoComplete="off"
        inputMode="numeric"
        maxLength={6}
        leading={<KeyRound className="h-4 w-4" />}
        hint="Code fourni par l'administration."
        error={error ?? undefined}
      />

      <Button type="submit" fullWidth size="lg" loading={submitting} leadingIcon={<BookOpen className="h-4 w-4" />}>
        Créer mon compte
      </Button>

      <p className="text-center text-[0.78rem] text-ink-400">
        Déjà un compte ?{' '}
        <button
          type="button"
          onClick={onDone}
          className="text-navy font-semibold hover:underline"
        >
          Connectez-vous
        </button>
      </p>
    </form>
  )
}
