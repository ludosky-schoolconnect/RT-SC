/**
 * RT-SC · Caissier auth.
 *
 * Tabs: Connexion | Inscription
 *
 * Login flow:
 *   - email + password → Firebase sign-in → AuthProvider sets profil
 *   - useEffect detects role:
 *       * 'caissier' + statut 'actif'      → /caissier
 *       * 'caissier' + statut 'en_attente' → en-attente placeholder
 *       * 'prof'                           → sign out, tell them to use prof entry
 *       * 'admin'                          → sign out, tell them to use admin entry
 *
 * Signup flow:
 *   1. Validate the school's passkeyCaisse BEFORE creating account.
 *      If passkeyCaisse is not set on the securite doc, fall back to
 *      passkeyProf (legacy school support — admin may not have
 *      generated a distinct caisse code yet).
 *   2. createUserWithEmailAndPassword
 *   3. Write professeurs/{uid} with role: 'caissier', statut: 'en_attente',
 *      empty matieres + classesIds (caissiers don't teach).
 *   4. Same approval flow as prof — admin flips statut to 'actif'.
 *      No manual role change needed; role is stamped at signup.
 *
 * Key differences vs ProfAuth:
 *   - No matières textarea in signup
 *   - Role stamped as 'caissier' at creation (not 'prof')
 *   - Code d'accès label says "caisse" not "professeur"
 *   - Different toast + routing on successful login
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
import { Eye, EyeOff, Mail, Lock, User, KeyRound, Wallet } from 'lucide-react'
import { auth, docRef } from '@/firebase'
import { ecoleSecuriteDoc, professeurDoc } from '@/lib/firestore-keys'
import { useAuth } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { translateAuthError } from '@/lib/auth-errors'
import { verifyPersonalCode, passkeyErrorMessage } from '@/lib/profPasskey'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ForgotPasswordModal } from '@/components/ui/ForgotPasswordModal'
import type { SecuriteConfig } from '@/types/models'

type Mode = 'login' | 'signup'

export default function CaisseAuth() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profil, hydrating } = useAuth()
  const [mode, setMode] = useState<Mode>('login')

  // Forward authenticated caissiers once their profil arrives.
  // A prof account that landed here (typed wrong URL or followed a
  // stale link) gets bounced to the prof entry point with a toast.
  useEffect(() => {
    if (hydrating) return
    if (!profil) return

    if (profil.role === 'admin') {
      void signOut(auth)
      toast.error("Cet espace est réservé aux caissiers.")
      return
    }

    if (profil.role === 'prof') {
      void signOut(auth)
      toast.error(
        "Vous avez un compte professeur. Utilisez l'espace professeur.",
        6000
      )
      return
    }

    if (profil.role !== 'caissier') {
      void signOut(auth)
      return
    }

    // Caissier — route to the dashboard OR en-attente screen.
    // The /prof/en-attente page is shared between prof + caissier
    // roles (role-aware copy) and auto-redirects to /caissier once
    // statut flips to 'actif'.
    if (profil.statut === 'en_attente') {
      navigate('/prof/en-attente', { replace: true })
    } else {
      toast.success(`Bienvenue, ${profil.nom.split(' ')[0]}.`)
      navigate('/caissier', { replace: true })
    }
  }, [profil, hydrating, navigate, toast])

  return (
    <AuthLayout
      kicker="Caissier"
      title={mode === 'login' ? 'Connexion' : 'Créer un compte caisse'}
      subtitle={
        mode === 'login'
          ? "Accédez au terminal de caisse, au bilan et au guichet d'admission."
          : "Demandez le code d'accès caisse auprès de l'administration."
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
                  layoutId="rt-sc-caisse-mode"
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
          {mode === 'login' ? (
            <CaisseLoginForm />
          ) : (
            <CaisseSignupForm onDone={() => setMode('login')} />
          )}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  )
}

// ─── Login form ─────────────────────────────────────────────

function CaisseLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [showCode, setShowCode] = useState(false)
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
      // See ProfAuth.tsx for the full rationale. Caissiers use the
      // same verifyProfLogin callable + 4h sessionStorage bypass
      // as profs.
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
        type={showCode ? 'text' : 'password'}
        placeholder="••••••"
        value={code}
        onChange={(e) => {
          setCode(e.target.value)
          setCodeError(null)
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={12}
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

function CaisseSignupForm({ onDone }: SignupProps) {
  const toast = useToast()
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passkey, setPasskey] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleanNom = nom.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanNom || !cleanEmail || password.length < 8 || !passkey) {
      setError('Veuillez remplir tous les champs (mot de passe ≥ 8 caractères).')
      return
    }

    setSubmitting(true)
    try {
      // 1. Validate the school's caisse passkey BEFORE creating account.
      //    Falls back to passkeyProf if passkeyCaisse is undefined
      //    (legacy school, admin hasn't generated a distinct code).
      const secSnap = await getDoc(docRef(ecoleSecuriteDoc()))
      const securite = secSnap.exists()
        ? (secSnap.data() as SecuriteConfig)
        : null

      const expectedKey =
        securite?.passkeyCaisse ?? securite?.passkeyProf ?? '123456'

      if (passkey.trim() !== expectedKey) {
        setError("Code d'accès caisse incorrect. Demandez le bon code à l'administration.")
        setSubmitting(false)
        return
      }

      // 2. Create the Firebase account
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password)

      // 3. Create the Firestore profile with role: 'caissier' already
      //    stamped. No manual role change needed after approval —
      //    admin just flips statut to 'actif' like any prof.
      await setDoc(docRef(professeurDoc(cred.user.uid)), {
        nom: cleanNom,
        email: cleanEmail,
        matieres: [],       // caissier doesn't teach
        classesIds: [],     // no class assignments
        role: 'caissier',
        statut: 'en_attente',
        createdAt: serverTimestamp(),
      })

      toast.success(
        "Compte caisse créé. En attente d'approbation par l'administration.",
        8000
      )
      // Parent's useEffect will navigate once profil lands via
      // AuthProvider's onSnapshot. Clear the button spinner so the
      // user isn't staring at a loading state indefinitely (the
      // en-attente redirect may take a beat, and until it does the
      // form is still visible).
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
        placeholder="KPETA Marcel"
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
        hint="Cet email servira pour vous connecter et recevoir un lien en cas d'oubli de mot de passe. Choisissez-le avec soin."
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
      <Input
        label="Code d'accès caisse"
        placeholder="6 chiffres"
        value={passkey}
        onChange={(e) => setPasskey(e.target.value)}
        autoComplete="off"
        inputMode="numeric"
        maxLength={6}
        leading={<KeyRound className="h-4 w-4" />}
        hint="Code de caisse fourni par l'administration (distinct du code professeur)."
        error={error ?? undefined}
      />

      <Button
        type="submit"
        fullWidth
        size="lg"
        loading={submitting}
        leadingIcon={<Wallet className="h-4 w-4" />}
      >
        Créer mon compte caisse
      </Button>

      <p className="text-center text-[0.78rem] text-ink-400">
        Déjà un compte caisse ?{' '}
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
