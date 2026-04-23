/**
 * RT-SC · Parent passkey login.
 *
 * Single-step flow: parent enters their child's passkey (PRNT-XXXX-XXXX).
 * Server-side lookup via the findEleveIdentity callable. On match,
 * sign in anonymously and populate the parent session.
 *
 * Multi-child support: if there's already a parent session, the new
 * child is APPENDED to the existing children list (so a parent with
 * multiple kids enters one passkey at a time and they all stay).
 *
 * Session E4 — the pre-Blaze fallback has been removed. Blaze must
 * be active; the eleves collectionGroup read rule is isStaff()-only
 * so no client-side scan is possible anyway.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { doc as fsDoc, updateDoc } from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { KeyRound, ArrowRight, ArrowLeft, Heart, Check } from 'lucide-react'

import { auth, db, functions } from '@/firebase'
import type { ParentSession, ParentChild } from '@/types/roles'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

/**
 * findEleveIdentity callable shape for parent passkey lookup.
 * Returns all fields the session needs — nom, genre, classeNom —
 * so no follow-up éleve doc read is required (which would fail
 * the E3-tightened collectionGroup read rule anyway).
 */
interface FindInput {
  mode: 'byParentPasskey'
  passkey: string
}
interface FindOutput {
  match: {
    eleveId: string
    classeId: string
    nom: string
    genre: 'M' | 'F'
    classePasskey: string
    classeNom: string
  } | null
}

export default function ParentLogin() {
  const navigate = useNavigate()
  const toast = useToast()
  const setParentSession = useAuthStore((s) => s.setParentSession)
  const existingSession = useAuthStore((s) => s.parentSession)

  const [passkey, setPasskey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // True when this is "+ Ajouter un enfant" mode (parent already logged in
  // and is adding another child). Detected by URL query OR by simple presence.
  const isAddingChild = !!existingSession && existingSession.children.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cleaned = passkey.trim().toUpperCase()
    if (!cleaned) {
      setError('Saisissez le code parent.')
      return
    }
    if (!/^PRNT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleaned)) {
      setError('Format invalide. Le code commence par PRNT- suivi de 8 caractères.')
      return
    }

    setSubmitting(true)
    try {
      // Session E4 — server-only lookup. findEleveIdentity returns
      // everything the session needs (no follow-up doc read).
      const call = httpsCallable<FindInput, FindOutput>(
        functions,
        'findEleveIdentity'
      )
      const res = await call({ mode: 'byParentPasskey', passkey: cleaned })
      if (!res.data.match) {
        setError("Code parent inconnu. Vérifiez avec l'école.")
        return
      }
      const eleveId = res.data.match.eleveId
      const classeId = res.data.match.classeId
      const eleveNom = res.data.match.nom
      const eleveGenre = res.data.match.genre
      const classeNomStr = res.data.match.classeNom

      // Detect duplicate: same child already linked to this session
      if (
        existingSession?.children.some(
          (c) => c.eleveId === eleveId && c.classeId === classeId
        )
      ) {
        setError('Cet enfant est déjà dans votre liste.')
        return
      }

      // Get or create the anonymous Firebase session uid
      let uid = existingSession?.uid
      if (!uid) {
        const cred = await signInAnonymously(auth)
        uid = cred.user.uid
      }

      // Best-effort write to mark active session on the élève.
      // Firestore rules permit an authenticated anon user to write
      // `active_parent_session_uid` to the éleve marker.
      try {
        await updateDoc(fsDoc(db, 'classes', classeId, 'eleves', eleveId), {
          active_parent_session_uid: uid,
        })
      } catch {
        // ignore — non-critical
      }

      const newChild: ParentChild = {
        eleveId,
        classeId,
        classeNom: classeNomStr,
        nom: eleveNom,
        genre: eleveGenre,
      }

      const session: ParentSession = existingSession
        ? {
            ...existingSession,
            children: [...existingSession.children, newChild],
            activeIndex: existingSession.children.length, // jump to the new one
          }
        : {
            children: [newChild],
            activeIndex: 0,
            uid,
          }

      setParentSession(session)
      toast.success(
        isAddingChild
          ? `${eleveNom} ajouté à votre espace.`
          : `Bienvenue. Espace de ${eleveNom}.`
      )
      navigate('/parent', { replace: true })
    } catch (err) {
      const errCode = (err as FunctionsError)?.code
      if (errCode === 'functions/resource-exhausted') {
        setError('Trop de tentatives. Réessayez dans quelques minutes.')
      } else if (errCode === 'functions/invalid-argument') {
        setError('Format de code invalide.')
      } else {
        console.error('[ParentLogin] error:', err)
        setError('Erreur réseau. Réessayez.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      backFallback="/welcome"
      kicker={isAddingChild ? 'Ajouter un enfant' : 'Espace parent'}
      title={isAddingChild ? 'Saisissez le code parent du nouvel enfant' : 'Bienvenue'}
      subtitle={
        isAddingChild
          ? "Chaque enfant a son propre code, fourni par l'école."
          : "Saisissez le code parent fourni par l'école pour accéder aux bulletins de votre enfant."
      }
    >
      {/* When adding another child: show which children are already linked,
          so the parent has context (and can tell why the "déjà dans votre
          liste" error fires if they enter a duplicate code). */}
      {isAddingChild && existingSession && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-5 rounded-xl bg-info-bg/50 ring-1 ring-navy/10 px-4 py-3"
        >
          <p className="text-[0.65rem] uppercase tracking-[0.18em] font-bold text-navy/70 mb-2">
            Déjà liés à cet appareil
          </p>
          <ul className="space-y-1.5">
            {existingSession.children.map((c) => (
              <li
                key={c.eleveId}
                className="flex items-center gap-2 text-[0.8125rem] text-navy"
              >
                <Check className="h-3.5 w-3.5 text-success shrink-0" aria-hidden />
                <span className="font-semibold truncate">{c.nom}</span>
                <span className="text-ink-400 text-[0.7rem] shrink-0">
                  · {c.classeNom}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigate('/parent')}
            className="mt-3 inline-flex items-center gap-1 text-[0.78rem] font-semibold text-navy/70 hover:text-navy transition-colors !min-h-0 !min-w-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Retour à mon espace
          </button>
        </motion.div>
      )}

      <motion.form
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        onSubmit={submit}
        className="space-y-5"
      >
        <Input
          label="Code parent"
          value={passkey}
          onChange={(e) => setPasskey(e.target.value)}
          placeholder="PRNT-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={14}
          autoFocus
          leading={<KeyRound className="h-4 w-4" />}
          error={error ?? undefined}
          hint={
            error
              ? undefined
              : 'Format : PRNT- suivi de 8 caractères. Demandez à l\'école si besoin.'
          }
        />

        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          fullWidth
          trailingIcon={<ArrowRight className="h-4 w-4" />}
        >
          {isAddingChild ? "Ajouter l'enfant" : 'Accéder à mon espace'}
        </Button>

        {!isAddingChild && (
          <div className="pt-3 border-t border-ink-100 text-center">
            <p className="inline-flex items-center gap-1.5 text-[0.78rem] text-ink-500">
              <Heart className="h-3.5 w-3.5 text-gold-dark" aria-hidden />
              Suivez le parcours de votre enfant en toute simplicité.
            </p>
          </div>
        )}
      </motion.form>
    </AuthLayout>
  )
}
