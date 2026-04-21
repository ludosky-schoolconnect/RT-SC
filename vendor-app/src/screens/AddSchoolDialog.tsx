/**
 * Vendor · Screen 2 — Add school dialog.
 *
 * A modal asking for:
 *   - Display name ("CEG HOUETO")
 *   - Firebase config blob (paste from Firebase Console)
 *
 * Accepts multiple paste formats (JSON, JS object literal, with or
 * without `const firebaseConfig =` prefix) — see parseFirebaseConfigBlob.
 */

import { useEffect, useRef, useState } from 'react'
import { X, Check, AlertCircle, Sparkles } from 'lucide-react'
import {
  deriveSchoolId,
  parseFirebaseConfigBlob,
  upsertSchool,
} from '@/lib/schoolsStorage'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Textarea } from '@/ui/Textarea'

interface Props {
  open: boolean
  onClose: () => void
  onAdded: () => void
}

export function AddSchoolDialog({ open, onClose, onAdded }: Props) {
  const [name, setName] = useState('')
  const [blob, setBlob] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Reset state on each open + focus first field
  useEffect(() => {
    if (open) {
      setName('')
      setBlob('')
      setError(null)
      setPreviewProjectId(null)
      // Focus the name input after the dialog animates in
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [open])

  // Live-parse the blob as the user types, so they see immediately
  // whether their paste is valid. This turns the blob textarea into
  // a friendly feedback loop rather than a submit-and-pray form.
  useEffect(() => {
    if (!blob.trim()) {
      setPreviewProjectId(null)
      setError(null)
      return
    }
    const config = parseFirebaseConfigBlob(blob)
    if (config) {
      setPreviewProjectId(config.projectId ?? null)
      setError(null)
    } else {
      setPreviewProjectId(null)
      setError(
        'Configuration Firebase invalide. Collez le bloc complet depuis la Firebase Console.'
      )
    }
  }, [blob])

  if (!open) return null

  function handleSubmit() {
    if (!name.trim()) {
      setError('Veuillez saisir un nom pour l\'école.')
      return
    }
    const config = parseFirebaseConfigBlob(blob)
    if (!config) {
      setError('Configuration Firebase invalide.')
      return
    }
    const id = deriveSchoolId(config)
    upsertSchool({
      id,
      name: name.trim(),
      config,
      lastUsed: undefined, // marked used only on first successful connection
    })
    onAdded()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-navy/40 flex items-start justify-center overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-lg my-8 mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-ink-100 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/15 border border-gold/30 shrink-0">
              <Sparkles className="h-4 w-4 text-gold-dark" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-navy leading-tight">
                Ajouter une école
              </h2>
              <p className="text-[0.75rem] text-ink-400 mt-0.5">
                La configuration est stockée localement dans ce navigateur.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-navy transition-colors"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <Input
            ref={nameInputRef}
            label="Nom de l'école"
            placeholder="Ex: CEG HOUETO"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Textarea
            label="Configuration Firebase"
            placeholder='Collez le bloc depuis Firebase Console, par exemple :

const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "monecole.firebaseapp.com",
  projectId: "monecole",
  ...
};'
            value={blob}
            onChange={(e) => setBlob(e.target.value)}
            rows={8}
            mono
            hint="Firebase Console → Paramètres du projet → Vos applications → Web app → Configuration"
          />

          {/* Live validation feedback */}
          {previewProjectId && (
            <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success-bg/60 px-3 py-2.5">
              <Check
                className="h-4 w-4 text-success shrink-0 mt-0.5"
                aria-hidden
              />
              <div className="text-[0.8rem] text-success-dark">
                <p className="font-semibold">Configuration valide.</p>
                <p className="text-[0.75rem] mt-0.5">
                  Projet :{' '}
                  <span className="font-mono">{previewProjectId}</span>
                </p>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg/60 px-3 py-2.5">
              <AlertCircle
                className="h-4 w-4 text-danger shrink-0 mt-0.5"
                aria-hidden
              />
              <p className="text-[0.8rem] text-danger-dark">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100 bg-off-white">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name.trim() || !previewProjectId}
            icon={<Check />}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}
