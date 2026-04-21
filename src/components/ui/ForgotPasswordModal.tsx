/**
 * RT-SC · Forgot password modal.
 *
 * Shared between AdminLogin and ProfAuth. Uses Firebase's built-in
 * sendPasswordResetEmail — no backend code needed; Firebase sends a
 * branded reset email with a one-time link.
 */

import { useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/firebase'
import { translateAuthError } from '@/lib/auth-errors'
import { useToast } from '@/stores/toast'
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter } from './Modal'
import { Input } from './Input'
import { Button } from './Button'

interface ForgotPasswordModalProps {
  open: boolean
  onClose: () => void
  /** Pre-fill the email input from the parent form */
  initialEmail?: string
}

export function ForgotPasswordModal({
  open,
  onClose,
  initialEmail = '',
}: ForgotPasswordModalProps) {
  const toast = useToast()
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Sync when the parent's email changes between mounts
  // (only when modal opens — initialEmail is read once per open)
  function handleClose() {
    setEmail(initialEmail)
    setError(null)
    setSubmitting(false)
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleaned = email.trim().toLowerCase()
    if (!cleaned) {
      setError('Veuillez saisir votre email.')
      return
    }

    setSubmitting(true)
    try {
      await sendPasswordResetEmail(auth, cleaned)
      // IMPORTANT: Firebase does NOT send an email if the address is
      // not linked to any existing account, but it also does not
      // reveal this (to prevent email enumeration attacks). So we
      // cannot say definitively "email sent" — we can only say a
      // link was REQUESTED for that address. The user must check
      // that they typed their signup email correctly if nothing
      // arrives.
      toast.success(
        `Si ${cleaned} est lié à un compte, un email vous a été envoyé. Vérifiez aussi vos spams.`,
        8000
      )
      handleClose()
    } catch (err) {
      // Firebase intentionally returns success even when email doesn't exist
      // (to avoid enumeration attacks). So most errors here are network issues.
      setError(translateAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} size="sm">
      <ModalHeader onClose={handleClose}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-bg text-navy">
            <Mail className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <ModalTitle>Mot de passe oublié</ModalTitle>
            <ModalDescription>
              Recevez un lien de réinitialisation par email.
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <form onSubmit={submit} className="space-y-3">
          <Input
            label="Email d'inscription"
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
            hint="Tapez l'adresse email exacte avec laquelle vous avez créé votre compte."
            error={error ?? undefined}
            autoFocus
          />
          <p className="text-[0.78rem] text-ink-400 leading-relaxed">
            <strong>Important :</strong> le lien sera envoyé uniquement si
            l'email correspond à un compte existant. Si vous ne recevez
            rien dans la minute, vérifiez votre dossier <strong>Spam</strong>,
            puis assurez-vous d'avoir saisi la même adresse que lors de
            votre inscription.
          </p>
        </form>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={handleClose}>
          Annuler
        </Button>
        <Button onClick={submit} loading={submitting} leadingIcon={<Send className="h-4 w-4" />}>
          Envoyer le lien
        </Button>
      </ModalFooter>
    </Modal>
  )
}
