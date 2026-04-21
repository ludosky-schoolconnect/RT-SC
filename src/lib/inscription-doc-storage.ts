/**
 * RT-SC · Pre-inscription document storage.
 *
 * Three improvements over legacy:
 *
 * 1. **Client-side compression** — images downscaled to max 1600px and
 *    re-encoded as JPEG q0.7 before upload. Typical 4MB phone photo
 *    → ~200KB. PDF passes through untouched (already compressed by
 *    the source app).
 *
 * 2. **Per-doc subcollection** — each upload becomes its own doc at
 *    /pre_inscriptions/{piId}/documents/{slugifiedName}, so the
 *    parent inscription stays light + admin's listing query doesn't
 *    pull file data unless requested.
 *
 * 3. **Post-finalize cleanup** — once admin moves the dossier to
 *    "Inscrit Officiellement", the document subcollection is wiped.
 *    Long-term DB stays trim. (Implemented in the finalize hook,
 *    not here — this file just provides the delete utility.)
 *
 * Per-doc size cap: ~900KB after compression, leaving headroom under
 * Firestore's 1MB doc limit. If a compressed file still exceeds, the
 * upload throws and the caller surfaces the error to the user.
 */

import {
  collection,
  deleteDoc,
  doc as fsDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'
import {
  preInscriptionDocsCol,
  preInscriptionDocDoc,
} from '@/lib/firestore-keys'
import type { PreInscriptionDocument } from '@/types/models'

// Per-doc cap after compression. Firestore allows 1MB per doc; we
// leave headroom for the metadata fields (nom, mimeType, etc.) plus
// base64 overhead (~33% bigger than raw bytes).
const MAX_DOC_BYTES = 900 * 1024  // 900KB

const IMAGE_MAX_DIM = 1600
const IMAGE_QUALITY = 0.7

/**
 * Slugify a document name into a Firestore-safe doc id.
 * "Acte de naissance" → "acte-de-naissance"
 */
export function slugifyDocName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Compress an image File. Returns a JPEG data URL.
 * Uses canvas; no external library needed.
 */
async function compressImage(file: File): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => {
      URL.revokeObjectURL(url)
      resolve(i)
    }
    i.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    i.src = url
  })

  // Compute target dimensions preserving aspect ratio
  let { width, height } = img
  if (width > IMAGE_MAX_DIM || height > IMAGE_MAX_DIM) {
    if (width >= height) {
      height = Math.round((height * IMAGE_MAX_DIM) / width)
      width = IMAGE_MAX_DIM
    } else {
      width = Math.round((width * IMAGE_MAX_DIM) / height)
      height = IMAGE_MAX_DIM
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas non disponible')
  ctx.drawImage(img, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', IMAGE_QUALITY)
}

/**
 * Convert a non-image (PDF) file to base64 data URL as-is.
 * No compression possible — PDF is already a packaged format.
 */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Estimate the byte size of a base64 data URL.
 * Base64 expands by ~4/3, so we reverse it for a useful estimate.
 */
function dataUrlBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(',')
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
  // Padding-aware: each '=' subtracts 1 byte
  const padding = (b64.match(/=+$/) || [''])[0].length
  return Math.floor((b64.length * 3) / 4) - padding
}

export interface PreparedDoc {
  /** Display name as configured in SettingsInscription. */
  nom: string
  dataUrl: string
  /** Estimated byte count after compression. */
  size: number
  mimeType: string
}

/**
 * Process a single upload: compress if image, raw if PDF, validate
 * size. Returns the prepared doc ready to write, or throws with a
 * user-facing French message.
 */
export async function prepareDoc(
  nom: string,
  file: File
): Promise<PreparedDoc> {
  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf'

  if (!isImage && !isPdf) {
    throw new Error(`Le fichier "${nom}" doit être une image ou un PDF.`)
  }

  let dataUrl: string
  let mimeType: string
  if (isImage) {
    dataUrl = await compressImage(file)
    mimeType = 'image/jpeg'
  } else {
    dataUrl = await fileToDataUrl(file)
    mimeType = file.type
  }

  const size = dataUrlBytes(dataUrl)

  if (size > MAX_DOC_BYTES) {
    if (isPdf) {
      throw new Error(
        `Le PDF "${nom}" est trop lourd (${Math.round(size / 1024)}KB). Compressez-le ou scannez à une qualité plus basse (max ${Math.round(MAX_DOC_BYTES / 1024)}KB).`
      )
    }
    throw new Error(
      `"${nom}" reste trop lourd après compression. Réduisez la résolution de l'original.`
    )
  }

  return { nom, dataUrl, size, mimeType }
}

/**
 * Write a prepared doc to /pre_inscriptions/{piId}/documents/{slug}.
 */
export async function uploadPreparedDoc(
  piId: string,
  prepared: PreparedDoc
): Promise<void> {
  const docId = slugifyDocName(prepared.nom)
  await setDoc(fsDoc(db, preInscriptionDocDoc(piId, docId)), {
    nom: prepared.nom,
    dataUrl: prepared.dataUrl,
    size: prepared.size,
    mimeType: prepared.mimeType,
    uploadedAt: serverTimestamp(),
  })
}

/**
 * Lazy-load all documents for a given pre-inscription. Used by the
 * admin viewer modal — listing pre-inscriptions does NOT call this,
 * so listings stay light.
 */
export async function fetchPreInscriptionDocs(
  piId: string
): Promise<PreInscriptionDocument[]> {
  const snap = await getDocs(collection(db, preInscriptionDocsCol(piId)))
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PreInscriptionDocument, 'id'>),
  }))
}

/**
 * Delete the entire documents subcollection for a pre-inscription.
 * Called after the dossier is finalized into a real élève — the docs
 * are no longer needed.
 *
 * Best-effort: failures are logged but don't block the caller (the
 * inscription doc itself is what matters; orphan docs are just space).
 */
export async function deleteAllDocsForInscription(
  piId: string
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0
  let failed = 0
  try {
    const snap = await getDocs(collection(db, preInscriptionDocsCol(piId)))
    const results = await Promise.allSettled(
      snap.docs.map((d) => deleteDoc(d.ref))
    )
    for (const r of results) {
      if (r.status === 'fulfilled') deleted++
      else failed++
    }
  } catch (e) {
    console.warn('[deleteAllDocsForInscription] non-fatal:', e)
  }
  return { deleted, failed }
}
