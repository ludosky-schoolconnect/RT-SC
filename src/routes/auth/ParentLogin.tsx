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
/**
 * Session E2 → E3 — findEleveIdentity callable shape.
 *
 * E3 expanded the match payload to include nom/genre/class info so
 * the client no longer needs a follow-up éleve doc read. Once the
 * E3 rules tighten the eleves collectionGroup to auth-required,
 * parents would fail the direct read otherwise (they sign in
 * anonymously only AFTER identity match).
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
      // Session E3 — callable returns everything we need. Legacy
      // fallback does the classic collectionGroup + getDoc reads.
      //
      // We collect the minimal set of fields the success flow needs
      // into local variables, populated by whichever path succeeds.
      let eleveId: string | null = null
      let classeId: string | null = null
      let eleveNom: string | null = null
      let eleveGenre: 'M' | 'F' | null = null
      let classeNomStr: string | null = null

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
        eleveNom = res.data.match.nom
        eleveGenre = res.data.match.genre
        classeNomStr = res.data.match.classeNom
      } catch (err) {
        const errCode = (err as FunctionsError)?.code
        if (!isFallbackCode(errCode)) {
          console.error('[ParentLogin] callable error:', err)
          setError('Vérification impossible. Réessayez dans quelques minutes.')
          return
        }

        // Legacy fallback — pre-Blaze path. Works while the eleves
        // collectionGroup rule is still `allow read: if true`.
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
        const eleveDoc = snap.docs[0]
        eleveId = eleveDoc.id
        classeId = eleveDoc.ref.parent.parent?.id ?? null
        const eleveRaw = eleveDoc.data() as Eleve
        eleveNom = eleveRaw.nom
        eleveGenre = eleveRaw.genre

        if (!classeId) {
          setError("Erreur de structure. Contactez l'école.")
          return
        }

        // Follow-up classe read to build the display name. Same
        // pre-E3 behavior — direct classe docs are still readable.
        const classeSnap = await getDoc(fsDoc(db, 'classes', classeId))
        if (!classeSnap.exists()) {
          setError("Classe introuvable. Contactez l'école.")
          return
        }
        const classeRaw = { id: classeSnap.id, ...(classeSnap.data() as Omit<Classe, 'id'>) }
        classeNomStr = nomClasse(classeRaw)
      }

      if (!eleveId || !classeId || !eleveNom || !eleveGenre || !classeNomStr) {
        setError("Erreur de structure. Contactez l'école.")
        return
      }

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
      // Post-E3, this still works — Firestore rules permit an
      // authenticated anon user to write `active_parent_session_uid`
      // to their own session marker.
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
