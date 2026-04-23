/**
 * RT-SC · Élève signup (identity verification).
 *
 * Three fields: nom, genre, date_naissance.
 * Server-side lookup via the findEleveIdentity Cloud Function
 * (admin SDK scans the eleves collection group, which is locked
 * down to staff-only reads at the rules layer — see E3 rules).
 * On success, displays the class name + passkey for the student to
 * write down.
 *
 * Session E4 — the pre-Blaze fallback (client-side collectionGroup
 * scan) has been removed. Blaze must be active for signup to work;
 * the Firestore rule on eleves collection group is isStaff()-only,
 * so the old fallback path would fail the rule anyway.
 *
 * Session F1 — when the callable is unavailable (functions/not-found,
 * functions/unavailable, functions/internal — pre-Blaze), the error
 * message now specifically explains the situation and instructs the
 * student to get their code from the administration directly. No
 * client-side fallback is possible because the eleves collectionGroup
 * read rule requires isStaff() authentication.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CircleCheck, GraduationCap, KeyRound, ArrowRight, User } from 'lucide-react'
import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { functions } from '@/firebase'
import type { Genre } from '@/types/models'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'

interface VerifyResult {
  passkey: string
  classeNom: string
}

/**
 * findEleveIdentity callable shape.
 * The expanded match payload includes everything the signup success
 * screen needs — no follow-up doc reads required.
 */
interface FindInput {
  mode: 'byIdentity'
  nom: string
  genre: 'M' | 'F'
  dateNaissance: string
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
      // Session E4 — server-only. The findEleveIdentity callable runs
      // with admin SDK so it can scan the eleves collection group
      // even though the rules layer restricts it to isStaff() reads.
      // There is no client-side fallback — if the callable is
      // unavailable, the user sees an error rather than a silent
      // weaker path.
      const call = httpsCallable<FindInput, FindOutput>(
        functions,
        'findEleveIdentity'
      )
      const res = await call({
        mode: 'byIdentity',
        nom: cleanNom,
        genre: genre as 'M' | 'F',
        dateNaissance,
      })

      if (!res.data.match) {
        setError(
          "Identité introuvable. Vérifiez l'orthographe exacte de votre nom et que l'école a bien créé votre profil."
        )
        return
      }

      setResult({
        passkey: res.data.match.classePasskey,
        classeNom: res.data.match.classeNom,
      })
    } catch (err) {
      const errCode = (err as FunctionsError)?.code
      if (errCode === 'functions/resource-exhausted') {
        setError('Trop de tentatives. Réessayez dans quelques minutes.')
      } else if (errCode === 'functions/invalid-argument') {
        setError('Données incomplètes. Vérifiez votre saisie.')
      } else if (
        errCode === 'functions/not-found' ||
        errCode === 'functions/unavailable' ||
        errCode === 'functions/internal'
      ) {
        // Blaze not active — no client-side fallback possible (eleves
        // collectionGroup requires isStaff() auth). Instruct student
        // to get their code from admin directly.
        setError(
          "La récupération de code n'est pas encore disponible (service Blaze requis). " +
          "Demandez votre code de classe directement à votre administration."
        )
      } else {
        console.error('[EleveSignup] verification error:', err)
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
