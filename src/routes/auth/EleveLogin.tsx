/**
 * RT-SC · Élève login (3-step flow).
 *
 * Step 1 — Passkey: enter the class passkey, fetch the class + élèves list
 * Step 2 — Select name: tap your name in the alphabetical list
 * Step 3 — PIN: enter your personal 6-char PIN
 *
 * On success:
 *   - signInAnonymously (Firebase) — required so Firestore writes are accepted
 *   - Update eleves/{id}.active_session_uid (best-effort, swallowed on failure)
 *   - Save EleveSession via the auth store → ProtectedRoute now lets /eleve in
 *   - Navigate to /eleve
 *
 * No legacy "_loginAttemptSource" or "blindfold" globals — the AuthProvider
 * deliberately ignores anonymous sessions, so élève login doesn't collide
 * with the admin/prof email-password observer.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  query, collection, where, getDocs, getDoc, doc as fsDoc, orderBy, updateDoc,
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import {
  KeyRound, GraduationCap, ArrowRight, ChevronLeft, Search,
  CircleCheck, Lock,
} from 'lucide-react'

import { auth, db } from '@/firebase'
import { nomClasse } from '@/lib/benin'
import { verifyStudentPin, studentPinErrorMessage } from '@/lib/studentPasskey'
import type { Classe, Eleve } from '@/types/models'
import type { EleveSession } from '@/types/roles'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalDescription } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

interface EleveListItem {
  id: string
  nom: string
}

type Step = 'passkey' | 'name' | 'done'

export default function EleveLogin() {
  const navigate = useNavigate()
  const toast = useToast()
  const setEleveSession = useAuthStore((s) => s.setEleveSession)

  const [step, setStep] = useState<Step>('passkey')

  // Step 1
  const [passkey, setPasskey] = useState('')
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [loadingPasskey, setLoadingPasskey] = useState(false)
  const [classe, setClasse] = useState<Classe | null>(null)
  const [eleves, setEleves] = useState<EleveListItem[]>([])

  // Step 2
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // PIN modal
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [submittingPin, setSubmittingPin] = useState(false)

  // Step 1: validate passkey + fetch class + load élèves
  async function submitPasskey(e: React.FormEvent) {
    e.preventDefault()
    setPasskeyError(null)

    const cleaned = passkey.trim().toUpperCase()
    if (cleaned.length < 4) {
      setPasskeyError('Veuillez entrer un code valide.')
      return
    }

    setLoadingPasskey(true)
    try {
      const classQ = query(collection(db, 'classes'), where('passkey', '==', cleaned))
      const classSnap = await getDocs(classQ)

      if (classSnap.empty) {
        setPasskeyError("Code introuvable. Vérifiez la saisie.")
        return
      }

      const cdoc = classSnap.docs[0]
      const cdata = { id: cdoc.id, ...(cdoc.data() as Omit<Classe, 'id'>) }

      const elevesSnap = await getDocs(
        query(collection(db, 'classes', cdoc.id, 'eleves'), orderBy('nom', 'asc'))
      )

      if (elevesSnap.empty) {
        setPasskeyError("Aucun élève enregistré dans cette classe pour le moment.")
        return
      }

      setClasse(cdata)
      setEleves(
        elevesSnap.docs.map((d) => ({
          id: d.id,
          nom: (d.data() as Eleve).nom,
        }))
      )
      setStep('name')
    } catch (err) {
      console.error('[EleveLogin] passkey lookup error:', err)
      setPasskeyError("Erreur de connexion. Vérifiez votre internet.")
    } finally {
      setLoadingPasskey(false)
    }
  }

  // Filtered name list (memoized for big classes)
  const filteredEleves = useMemo(() => {
    if (!search.trim()) return eleves
    const term = search.toLowerCase()
    return eleves.filter((e) => e.nom.toLowerCase().includes(term))
  }, [eleves, search])

  // Step 2 → Open PIN modal
  function openPin() {
    if (!selectedId) return
    setPin('')
    setPinError(null)
    setPinModalOpen(true)
  }

  // Step 3 — Validate PIN (server-first, client fallback), sign in, navigate
  async function submitPin(e?: React.FormEvent) {
    e?.preventDefault()
    setPinError(null)

    if (!selectedId || !classe) return
    const cleanPin = pin.trim().toUpperCase()
    if (cleanPin.length < 4) {
      setPinError("Code PIN invalide.")
      return
    }

    setSubmittingPin(true)
    try {
      // Server-side PIN check (pre-Blaze falls back to client-side read)
      const result = await verifyStudentPin(classe.id, selectedId, cleanPin)
      if (!result.ok) {
        setPinError(studentPinErrorMessage(result.reason))
        return
      }

      // Read élève name for the session (we still need a lightweight doc read)
      const eleveSnap = await getDoc(fsDoc(db, 'classes', classe.id, 'eleves', selectedId))
      if (!eleveSnap.exists()) {
        setPinError("Profil introuvable. Contactez votre professeur.")
        return
      }
      const eleveData = eleveSnap.data() as Eleve

      // Anonymous Firebase sign-in
      const cred = await signInAnonymously(auth)

      // Best-effort: stamp active session UID
      try {
        await updateDoc(fsDoc(db, 'classes', classe.id, 'eleves', selectedId), {
          active_session_uid: cred.user.uid,
        })
      } catch {
        // Ignore — non-critical
      }

      const session: EleveSession = {
        eleveId: selectedId,
        classeId: classe.id,
        classeNom: nomClasse(classe),
        nom: eleveData.nom,
        uid: cred.user.uid,
      }

      setEleveSession(session)
      setStep('done')

      setTimeout(() => {
        toast.success(`Bienvenue, ${eleveData.nom.split(' ')[0]} !`)
        navigate('/eleve', { replace: true })
      }, 700)
    } catch (err) {
      console.error('[EleveLogin] PIN submission error:', err)
      setPinError("Erreur réseau. Réessayez.")
    } finally {
      setSubmittingPin(false)
    }
  }

  return (
    <AuthLayout
      backFallback="/auth/eleve"
      kicker={step === 'passkey' ? 'Étape 1 sur 2' : 'Étape 2 sur 2'}
      title={
        step === 'passkey' ? 'Code de classe' : step === 'name' ? 'Sélectionnez votre nom' : 'Connexion réussie'
      }
      subtitle={
        step === 'passkey'
          ? 'Le code à 6 caractères fourni avec votre profil.'
          : step === 'name'
            ? `Classe ${classe ? nomClasse(classe) : ''}`
            : undefined
      }
    >
      <AnimatePresence mode="wait">
        {step === 'passkey' && (
          <motion.form
            key="step-passkey"
            onSubmit={submitPasskey}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <Input
              value={passkey}
              onChange={(e) => {
                setPasskey(e.target.value.toUpperCase())
                setPasskeyError(null)
              }}
              placeholder="XX-9999"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              className="text-center font-mono tracking-[0.2em] text-lg"
              leading={<KeyRound className="h-4 w-4" />}
              error={passkeyError ?? undefined}
            />
            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={loadingPasskey}
              trailingIcon={!loadingPasskey ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              Continuer
            </Button>
            <p className="text-center text-[0.78rem] text-ink-400 mt-2">
              Pas de code ?{' '}
              <a
                href="/auth/eleve/signup"
                className="text-navy font-semibold hover:underline"
              >
                Vérifier mon identité
              </a>
            </p>
          </motion.form>
        )}

        {step === 'name' && classe && (
          <motion.div
            key="step-name"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher mon nom…"
              leading={<Search className="h-4 w-4" />}
            />

            <div className="rounded-md border-[1.5px] border-ink-100 bg-white max-h-[55vh] overflow-y-auto">
              {filteredEleves.length === 0 ? (
                <p className="text-center text-sm text-ink-400 py-6">
                  Aucun nom ne correspond.
                </p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {filteredEleves.map((e) => {
                    const active = e.id === selectedId
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(e.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 text-left min-h-touch',
                            'transition-colors duration-150',
                            active
                              ? 'bg-info-bg text-navy'
                              : 'hover:bg-ink-50 text-ink-800'
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display font-bold text-sm',
                              active ? 'bg-navy text-white' : 'bg-ink-100 text-ink-600'
                            )}
                          >
                            {e.nom.charAt(0).toUpperCase()}
                          </div>
                          <span className="flex-1 font-medium">{e.nom}</span>
                          {active && <CircleCheck className="h-5 w-5 text-navy" aria-hidden />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStep('passkey')
                  setSelectedId(null)
                  setSearch('')
                }}
                leadingIcon={<ChevronLeft className="h-4 w-4" />}
              >
                Retour
              </Button>
              <Button
                type="button"
                fullWidth
                size="lg"
                disabled={!selectedId}
                onClick={openPin}
                trailingIcon={<ArrowRight className="h-4 w-4" />}
              >
                Continuer
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div
            key="step-done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="text-center py-8"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 16 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-bg border-2 border-success/30"
            >
              <GraduationCap className="h-8 w-8 text-success" aria-hidden />
            </motion.div>
            <p className="font-display text-xl font-bold text-navy mb-1">
              Connexion en cours…
            </p>
            <Spinner className="mt-3" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN modal */}
      <Modal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        size="sm"
        disableOverlayClose
      >
        <ModalHeader onClose={() => setPinModalOpen(false)}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-pale text-warning border border-gold/30">
              <Lock className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <ModalTitle>Code PIN personnel</ModalTitle>
              <ModalDescription>
                {selectedId && eleves.find((e) => e.id === selectedId)?.nom}
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody>
          <form onSubmit={submitPin} className="space-y-3">
            <Input
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.toUpperCase())
                setPinError(null)
              }}
              placeholder="••••••"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={6}
              className="text-center font-mono tracking-[0.4em] text-2xl"
              error={pinError ?? undefined}
              autoFocus
            />
          </form>
        </ModalBody>

        <ModalFooter>
          <Button variant="secondary" onClick={() => setPinModalOpen(false)}>
            Annuler
          </Button>
          <Button onClick={() => submitPin()} loading={submittingPin}>
            Valider
          </Button>
        </ModalFooter>
      </Modal>
    </AuthLayout>
  )
}
