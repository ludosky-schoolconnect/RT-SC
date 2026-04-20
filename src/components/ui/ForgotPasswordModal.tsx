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
      toast.success(`Email envoyé à ${cleaned}. Vérifiez votre boîte de réception.`)
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
            label="Email du compte"
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
            error={error ?? undefined}
            autoFocus
          />
          <p className="text-[0.78rem] text-ink-400 leading-relaxed">
            Vous recevrez un lien sécurisé pour définir un nouveau mot de passe.
            Vérifiez aussi votre dossier <strong>Spam</strong> si l'email n'arrive
            pas dans la minute.
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
