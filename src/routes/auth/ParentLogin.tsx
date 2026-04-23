/**
 * RT-SC · Parent passkey login.
 *
 * Single-step flow: parent enters their child's passkey (PRNT-XXXX-XXXX).
 * We look up the élève via collectionGroup query on `passkeyParent`.
 * On match, sign in anonymously and populate the parent session.
 *
 * Multi-child support: if there's already a parent session, the new
 * child is APPENDED to the existing children list (so a parent with
 * multiple kids enters one passkey at a time and they all stay).
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  collectionGroup, getDocs, query, where, doc as fsDoc, getDoc, updateDoc,
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { KeyRound, ArrowRight, ArrowLeft, Heart, Check } from 'lucide-react'

import { auth, db, functions } from '@/firebase'
import { nomClasse } from '@/lib/benin'
import type { Classe, Eleve } from '@/types/models'
import type { ParentSession, ParentChild } from '@/types/roles'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

/**
 * Session E2 — findEleveIdentity callable for parent-passkey lookup.
 * Returns only { eleveId, classeId }; the full éleve doc read happens
 * as a follow-up via getDoc (same as pre-E2 flow) so the callable
 * return payload stays minimal.
 */
interface FindInput {
  mode: 'byParentPasskey'
  passkey: string
}
interface FindOutput {
  match: { eleveId: string; classeId: string } | null
}

/** Error codes meaning "Blaze not active — fall back to legacy path". */
function isFallbackCode(code: string | undefined): boolean {
  return (
    code === 'functions/not-found' ||
    code === 'functions/unavailable' ||
    code === 'functions/internal'
  )
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
      // Session E2 — server-side lookup first, legacy collectionGroup
      // scan as fallback. Once Blaze is on, the callable does the
      // scan via admin SDK and the fallback below becomes dead code.
      let eleveId: string | null = null
      let classeId: string | null = null

      try {
        const call = httpsCallable<FindInput, FindOutput>(
          functions,
          'findEleveIdentity'
        )
        const res = await call({ mode: 'byParentPasskey', passkey: cleaned })
        if (!res.data.match) {
          setError("Code parent inconnu. Vérifiez avec l'école.")
          return
        }
        eleveId = res.data.match.eleveId
        classeId = res.data.match.classeId
      } catch (err) {
        const errCode = (err as FunctionsError)?.code
        if (!isFallbackCode(errCode)) {
          console.error('[ParentLogin] callable error:', err)
          setError('Vérification impossible. Réessayez dans quelques minutes.')
          return
        }

        // Legacy fallback — same as pre-E2 behavior
        const snap = await getDocs(
          query(
            collectionGroup(db, 'eleves'),
            where('passkeyParent', '==', cleaned)
          )
        )
        if (snap.empty) {
          setError("Code parent inconnu. Vérifiez avec l'école.")
          return
        }
        eleveId = snap.docs[0].id
        classeId = snap.docs[0].ref.parent.parent?.id ?? null
      }

      if (!eleveId || !classeId) {
        setError("Erreur de structure. Contactez l'école.")
        return
      }

      // Fetch full éleve doc to get nom/genre for the session.
      // Currently passes the `allow read: if true` rule; once E3
      // tightens that rule, this read will need to happen after the
      // anonymous sign-in below.
      const eleveSnap = await getDoc(fsDoc(db, 'classes', classeId, 'eleves', eleveId))
      if (!eleveSnap.exists()) {
        setError("Profil élève introuvable. Contactez l'école.")
        return
      }
      const eleve = { id: eleveSnap.id, ...(eleveSnap.data() as Omit<Eleve, 'id'>) }

      // Detect duplicate: same child already linked to this session
      if (
        existingSession?.children.some(
          (c) => c.eleveId === eleve.id && c.classeId === classeId
        )
      ) {
        setError('Cet enfant est déjà dans votre liste.')
        return
      }

      const classeSnap = await getDoc(fsDoc(db, 'classes', classeId))
      if (!classeSnap.exists()) {
        setError("Classe introuvable. Contactez l'école.")
        return
      }
      const classe = { id: classeSnap.id, ...(classeSnap.data() as Omit<Classe, 'id'>) }

      // Get or create the anonymous Firebase session uid
      let uid = existingSession?.uid
      if (!uid) {
        const cred = await signInAnonymously(auth)
        uid = cred.user.uid
      }

      // Best-effort write to mark active session on the élève
      try {
        await updateDoc(fsDoc(db, 'classes', classeId, 'eleves', eleve.id), {
          active_parent_session_uid: uid,
        })
      } catch {
        // ignore — non-critical
      }

      const newChild: ParentChild = {
        eleveId: eleve.id,
        classeId,
        classeNom: nomClasse(classe),
        nom: eleve.nom,
        genre: eleve.genre,
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
          ? `${eleve.nom} ajouté à votre espace.`
          : `Bienvenue. Espace de ${eleve.nom}.`
      )
      navigate('/parent', { replace: true })
    } catch (err) {
      console.error('[ParentLogin] error:', err)
      setError('Erreur réseau. Réessayez.')
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
