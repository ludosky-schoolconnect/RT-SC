/**
 * RT-SC · Élève signup (identity verification).
 *
 * Three fields: nom, genre, date_naissance.
 * Searches across ALL classes for an exact (nom, genre, date_naissance) match.
 * On success, displays the class name + passkey for the student to write down.
 *
 * Heavy read on first run (one collection-group scan or one classes loop) —
 * but happens at most once per élève per device, then they switch to the login
 * flow with the saved passkey. Acceptable.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CircleCheck, GraduationCap, KeyRound, ArrowRight, User } from 'lucide-react'
import {
  collectionGroup,
  query,
  where,
  getDocs,
  getDoc,
  doc as fsDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { nomClasse } from '@/lib/benin'
import type { Classe, Eleve, Genre } from '@/types/models'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'

interface VerifyResult {
  passkey: string
  classeNom: string
}

export default function EleveSignup() {
  const navigate = useNavigate()

  const [nom, setNom] = useState('')
  const [genre, setGenre] = useState<Genre | ''>('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)

    const cleanNom = nom.trim()
    if (!cleanNom || !genre || !dateNaissance) {
      setError('Veuillez renseigner votre nom complet, votre genre et votre date de naissance.')
      return
    }

    setSubmitting(true)
    try {
      // Single collectionGroup query is far cheaper than looping every class.
      // Requires the composite index defined in firestore.indexes.json.
      const q = query(
        collectionGroup(db, 'eleves'),
        where('nom', '==', cleanNom),
        where('genre', '==', genre),
        where('date_naissance', '==', dateNaissance)
      )
      const snap = await getDocs(q)

      if (snap.empty) {
        setError(
          "Identité introuvable. Vérifiez l'orthographe exacte de votre nom et que l'école a bien créé votre profil."
        )
        return
      }

      // Take the first match (in practice unique per élève)
      const eleveSnap = snap.docs[0]
      const eleveData = eleveSnap.data() as Eleve
      void eleveData
      const classeId = eleveSnap.ref.parent.parent?.id
      if (!classeId) {
        setError('Données incomplètes. Contactez votre administration.')
        return
      }

      const classeSnap = await getDoc(fsDoc(db, 'classes', classeId))
      if (!classeSnap.exists()) {
        setError('Votre classe est introuvable. Contactez votre administration.')
        return
      }
      const classeData = classeSnap.data() as Classe

      setResult({
        passkey: classeData.passkey,
        classeNom: nomClasse(classeData),
      })
    } catch (err) {
      console.error('[EleveSignup] verification error:', err)
      const code =
        typeof err === 'object' && err && 'code' in err
          ? String((err as { code?: string }).code)
          : ''
      if (code === 'failed-precondition' || code === 'permission-denied') {
        // Firestore composite index missing OR security rules block the read.
        // The Firebase SDK puts a "create index" URL in the error message — log it
        // so a developer with DevTools open can click it.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            '[EleveSignup] Firestore index probably missing. Open DevTools → Console for the URL to auto-create it. See PHASE-2-NOTES.md.'
          )
          // eslint-disable-next-line no-console
          console.warn(err)
        }
        setError(
          "L'index de recherche n'est pas encore configuré. Contactez l'administration."
        )
      } else {
        setError("Erreur de vérification. Vérifiez votre internet ou réessayez plus tard.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      backFallback="/auth/eleve"
      kicker="Vérification d'identité"
      title="Récupérer mon code"
      subtitle="Indiquez les informations exactes enregistrées par votre école."
    >
      <AnimatePresence mode="wait">
        {!result ? (
          <motion.form
            key="form"
            onSubmit={submit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <Input
              label="Nom complet"
              placeholder="Tel qu'enregistré par l'école"
              value={nom}
              onChange={(e) => {
                setNom(e.target.value)
                setError(null)
              }}
              autoCapitalize="words"
              leading={<User className="h-4 w-4" />}
            />
            <Select
              label="Genre"
              value={genre}
              onChange={(e) => {
                setGenre(e.target.value as Genre | '')
                setError(null)
              }}
            >
              <option value="">— Choisir —</option>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </Select>
            <Input
              label="Date de naissance"
              type="date"
              value={dateNaissance}
              onChange={(e) => {
                setDateNaissance(e.target.value)
                setError(null)
              }}
              error={error ?? undefined}
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={submitting}
              trailingIcon={!submitting ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              Vérifier mon identité
            </Button>

            <p className="text-center text-[0.78rem] text-ink-400 mt-4">
              Votre profil doit déjà avoir été créé par votre administration.
            </p>
          </motion.form>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            <div className="bg-success-bg border-[1.5px] border-success/30 rounded-lg p-5 text-center">
              <motion.div
                initial={{ scale: 0.6, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 16 }}
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success text-white"
              >
                <CircleCheck className="h-6 w-6" aria-hidden />
              </motion.div>
              <p className="font-display text-lg font-bold text-success mb-1">
                Identité vérifiée
              </p>
              <p className="text-sm text-ink-600">
                Votre code d'accès a été retrouvé.
              </p>
            </div>

            <div className="bg-white border-[1.5px] border-ink-100 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-bg text-navy">
                  <GraduationCap className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400">
                    Votre classe
                  </p>
                  <p className="font-display text-lg font-semibold text-navy">
                    {result.classeNom}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-pale text-warning border border-gold/30">
                  <KeyRound className="h-5 w-5" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400">
                    Code de classe
                  </p>
                  <p className="font-mono text-2xl font-bold text-navy tracking-[0.15em]">
                    {result.passkey}
                  </p>
                </div>
              </div>

              <div className="bg-warning-bg border border-warning/20 rounded-md px-4 py-3">
                <p className="text-[0.8125rem] text-warning font-semibold leading-snug">
                  Notez ce code dans un endroit sûr. Vous en aurez besoin à chaque
                  connexion avec votre PIN personnel.
                </p>
              </div>
            </div>

            <Button
              fullWidth
              size="lg"
              onClick={() => navigate('/auth/eleve/login')}
              trailingIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continuer vers la connexion
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
