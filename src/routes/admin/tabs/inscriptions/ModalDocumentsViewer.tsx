/**
 * RT-SC · Documents viewer modal.
 *
 * Lazy-loads the dossier's document subcollection (per-doc storage)
 * AND falls back to the legacy embedded `documents` map if the
 * subcollection is empty (back-compat with old data).
 *
 * Each document renders inline (image preview) or as an "Ouvrir le PDF"
 * button (opens in new tab via blob URL).
 */

import { useEffect, useState } from 'react'
import { FileText, Download, Image as ImageIcon, FileType } from 'lucide-react'
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { fetchPreInscriptionDocs } from '@/lib/inscription-doc-storage'
import type {
  PreInscription,
  PreInscriptionDocument,
} from '@/types/models'

interface Props {
  open: boolean
  inscription: PreInscription | null
  onClose: () => void
}

interface DisplayDoc {
  nom: string
  dataUrl: string
  mimeType: string
  size?: number
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)}Mo`
}

function inferMimeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/)
  return m ? m[1] : 'application/octet-stream'
}

export function ModalDocumentsViewer({ open, inscription, onClose }: Props) {
  const [docs, setDocs] = useState<DisplayDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !inscription) return

    setDocs([])
    setError(null)
    setLoading(true)

    let cancelled = false

    async function load() {
      if (!inscription) return
      try {
        // Try the new subcollection first
        const fromSub = await fetchPreInscriptionDocs(inscription.id)
        const subDocs: DisplayDoc[] = fromSub.map(
          (d: PreInscriptionDocument) => ({
            nom: d.nom,
            dataUrl: d.dataUrl,
            mimeType: d.mimeType ?? inferMimeFromDataUrl(d.dataUrl),
            size: d.size,
          })
        )

        let combined = subDocs

        // Fallback: legacy embedded `documents` map
        if (
          subDocs.length === 0 &&
          inscription.documents &&
          Object.keys(inscription.documents).length > 0
        ) {
          combined = Object.entries(inscription.documents).map(
            ([nom, dataUrl]) => ({
              nom,
              dataUrl,
              mimeType: inferMimeFromDataUrl(dataUrl),
            })
          )
        }

        if (!cancelled) setDocs(combined)
      } catch (err) {
        if (!cancelled) {
          console.error('[viewer] fetch error:', err)
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, inscription])

  function openInNewTab(d: DisplayDoc) {
    // Convert data URL to blob URL for proper PDF handling
    try {
      const a = document.createElement('a')
      a.href = d.dataUrl
      a.download = `${d.nom}${d.mimeType === 'application/pdf' ? '.pdf' : '.jpg'}`
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error('[open doc] error:', err)
    }
  }

  return (
    <Modal open={open && !!inscription} onClose={onClose} size="lg">
      <ModalHeader>
        <ModalTitle>Documents du dossier</ModalTitle>
        <ModalDescription>
          {inscription?.nom} — {inscription?.niveauSouhaite}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="rounded-md bg-danger-bg border border-danger/30 p-3 text-[0.82rem] text-danger">
            Échec de chargement des documents : {error}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-8 text-ink-400">
            <FileText className="h-9 w-9 mx-auto mb-2 text-ink-300" aria-hidden />
            <p className="text-[0.82rem]">Aucun document joint à ce dossier.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((d, i) => (
              <DocumentRow key={`${d.nom}-${i}`} d={d} onOpen={() => openInNewTab(d)} />
            ))}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button onClick={onClose}>Fermer</Button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Doc row ─────────────────────────────────────────────────

function DocumentRow({ d, onOpen }: { d: DisplayDoc; onOpen: () => void }) {
  const isImage = d.mimeType.startsWith('image/')
  const isPdf = d.mimeType === 'application/pdf'

  return (
    <article className="rounded-lg border border-ink-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-navy/8 text-navy ring-1 ring-navy/20">
          {isImage ? (
            <ImageIcon className="h-4 w-4" aria-hidden />
          ) : isPdf ? (
            <FileType className="h-4 w-4" aria-hidden />
          ) : (
            <FileText className="h-4 w-4" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[0.9rem] text-navy truncate">{d.nom}</p>
          <p className="text-[0.7rem] text-ink-500">
            {d.mimeType}
            {d.size != null && ` · ${formatBytes(d.size)}`}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Download className="h-3.5 w-3.5" />}
          onClick={onOpen}
        >
          Ouvrir
        </Button>
      </div>

      {isImage && (
        <div className="rounded-md overflow-hidden border border-ink-100 bg-ink-50/40 max-h-64 flex justify-center">
          <img
            src={d.dataUrl}
            alt={d.nom}
            className="max-w-full max-h-64 object-contain"
            loading="lazy"
          />
        </div>
      )}
    </article>
  )
}
