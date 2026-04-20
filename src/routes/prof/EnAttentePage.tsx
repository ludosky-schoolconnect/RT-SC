/**
 * RT-SC · Prof "en attente d'approbation" screen.
 *
 * Shown to a professeur who has signed up but whose statut is still 'en_attente'.
 * The AuthProvider's live snapshot of the prof's doc means as soon as an admin
 * sets statut to 'actif', this screen automatically transitions away (the
 * useEffect navigates to /prof) — no manual refresh needed.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { ShieldCheck, Clock, LogOut } from 'lucide-react'
import { auth } from '@/firebase'
import { useAuth } from '@/stores/auth'
import { Button } from '@/components/ui/Button'

export default function EnAttentePage() {
  const navigate = useNavigate()
  const { profil } = useAuth()

  // Auto-redirect when admin approves
  useEffect(() => {
    if (profil?.role === 'prof' && profil.statut === 'actif') {
      navigate('/prof', { replace: true })
    }
  }, [profil, navigate])

  async function logout() {
    await signOut(auth)
    navigate('/welcome', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-off-white flex items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full bg-white rounded-lg border border-ink-100 shadow-sm p-7 text-center"
      >
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 18 }}
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gold-pale border-2 border-gold/30"
        >
          <Clock className="h-8 w-8 text-warning" aria-hidden />
        </motion.div>

        <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
          Approbation en cours
        </p>

        <h1 className="font-display text-2xl font-bold text-navy mb-3">
          Votre demande est en attente
        </h1>

        <p className="text-[0.9375rem] text-ink-600 leading-relaxed mb-6">
          Bonjour {profil?.nom?.split(' ')[0] ?? 'Professeur'}. Votre compte a bien
          été créé. L'administration doit valider votre profil avant que vous
          puissiez accéder à votre tableau de bord.
        </p>

        <div className="flex items-center gap-3 justify-center text-[0.78rem] text-ink-400 bg-ink-50 rounded-md px-4 py-3 mb-6">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Cet écran se mettra à jour <strong className="text-navy">automatiquement</strong>{' '}
            dès l'approbation.
          </span>
        </div>

        <Button
          variant="secondary"
          fullWidth
          onClick={logout}
          leadingIcon={<LogOut className="h-4 w-4" />}
        >
          Se déconnecter
        </Button>
      </motion.div>
    </div>
  )
}
