/**
 * RT-SC · Settings inscription — read + write hooks.
 *
 * Doc lives at /settings_inscription/config.
 *
 * Schema migration: legacy stored `documents: string[]` with magic
 * prefixes. New schema uses `categories[]` or `documentsSimple[]`.
 * The hook auto-migrates legacy data on first read, returning a
 * normalized shape — but the original legacy `documents` field is
 * preserved in Firestore until admin saves the new shape.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { settingsInscriptionDoc } from '@/lib/firestore-keys'
import type {
  InscriptionCategorie,
  InscriptionDocSpec,
  SettingsInscription,
} from '@/types/models'
import {
  DEFAULT_DELAI_MIN_JOURS,
  DEFAULT_PLACES_PAR_JOUR,
} from '@/lib/inscription-rdv'

const TEN_MIN = 10 * 60_000

const DEFAULT_SETTINGS: SettingsInscription = {
  // Default OPEN — preserves behavior for schools that haven't seen
  // this feature yet. Admin can flip to false to close.
  preinscriptionsOuvertes: true,
  categories: [],
  documentsSimple: [{ nom: 'Acte de naissance', requis: true }],
  materiel: [],
  rendezVousPlacesParJour: DEFAULT_PLACES_PAR_JOUR,
  rendezVousDelaiMinJours: DEFAULT_DELAI_MIN_JOURS,
}

/**
 * Parse legacy `documents: string[]` into modern categories.
 * Magic syntax:
 *   "[Category Name]" → starts a new category
 *   "*Doc Name*" → required doc in current category
 *   '"Doc Name"' → optional doc in current category
 *   "Doc Name" (plain) → required doc (legacy default)
 */
function migrateLegacyDocuments(legacy: string[]): {
  categories: InscriptionCategorie[]
  documentsSimple: InscriptionDocSpec[]
} {
  const categories: InscriptionCategorie[] = []
  const flat: InscriptionDocSpec[] = []
  let currentCat: InscriptionCategorie | null = null

  for (const raw of legacy) {
    const s = raw.trim()
    if (!s) continue

    // Category marker
    if (s.startsWith('[') && s.endsWith(']')) {
      const nom = s.slice(1, -1).trim()
      currentCat = { nom, documents: [] }
      categories.push(currentCat)
      continue
    }

    // Doc spec: parse required/optional markers
    let nom = s
    let requis = true
    if (s.startsWith('"') && s.endsWith('"')) {
      nom = s.slice(1, -1).trim()
      requis = false
    } else if (s.startsWith('*') && s.endsWith('*')) {
      nom = s.slice(1, -1).trim()
      requis = true
    }

    const spec: InscriptionDocSpec = { nom, requis }
    if (currentCat) currentCat.documents.push(spec)
    else flat.push(spec)
  }

  return { categories, documentsSimple: flat }
}

export function useSettingsInscription() {
  return useQuery<SettingsInscription>({
    queryKey: ['settings-inscription'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, settingsInscriptionDoc()))
      if (!snap.exists()) return DEFAULT_SETTINGS
      const data = snap.data() as SettingsInscription

      // If new shape already populated, return as-is
      const hasNew =
        (data.categories && data.categories.length > 0) ||
        (data.documentsSimple && data.documentsSimple.length > 0)

      if (hasNew) {
        return {
          preinscriptionsOuvertes: data.preinscriptionsOuvertes ?? true,
          categories: data.categories ?? [],
          documentsSimple: data.documentsSimple ?? [],
          materiel: data.materiel ?? [],
          rendezVousPlacesParJour:
            data.rendezVousPlacesParJour ?? DEFAULT_PLACES_PAR_JOUR,
          rendezVousDelaiMinJours:
            data.rendezVousDelaiMinJours ?? DEFAULT_DELAI_MIN_JOURS,
          documents: data.documents,
        }
      }

      // Legacy shape — migrate on read (don't write back unless admin saves)
      if (data.documents && data.documents.length > 0) {
        const migrated = migrateLegacyDocuments(data.documents)
        return {
          preinscriptionsOuvertes: data.preinscriptionsOuvertes ?? true,
          categories: migrated.categories,
          documentsSimple: migrated.documentsSimple,
          materiel: data.materiel ?? [],
          rendezVousPlacesParJour:
            data.rendezVousPlacesParJour ?? DEFAULT_PLACES_PAR_JOUR,
          rendezVousDelaiMinJours:
            data.rendezVousDelaiMinJours ?? DEFAULT_DELAI_MIN_JOURS,
          documents: data.documents,
        }
      }

      // Truly empty doc — return defaults
      return {
        ...DEFAULT_SETTINGS,
        preinscriptionsOuvertes: data.preinscriptionsOuvertes ?? true,
        materiel: data.materiel ?? [],
        rendezVousPlacesParJour:
          data.rendezVousPlacesParJour ?? DEFAULT_PLACES_PAR_JOUR,
        rendezVousDelaiMinJours:
          data.rendezVousDelaiMinJours ?? DEFAULT_DELAI_MIN_JOURS,
      }
    },
    staleTime: TEN_MIN,
  })
}

export function useUpdateSettingsInscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<SettingsInscription>) => {
      // When admin saves the new shape, drop the legacy `documents`
      // string array — it's been migrated and is no longer authoritative.
      const payload: Record<string, unknown> = {
        categories: patch.categories ?? [],
        documentsSimple: patch.documentsSimple ?? [],
        materiel: patch.materiel ?? [],
        rendezVousPlacesParJour: Math.max(
          1,
          Number(patch.rendezVousPlacesParJour) || DEFAULT_PLACES_PAR_JOUR
        ),
        rendezVousDelaiMinJours: Math.max(
          1,
          Number(patch.rendezVousDelaiMinJours) || DEFAULT_DELAI_MIN_JOURS
        ),
        // Explicit null clears the legacy field
        documents: null,
      }
      // Only include preinscriptionsOuvertes if the caller provided it;
      // omitting it preserves the existing server value (critical so
      // pressing "Save" on the docs editor doesn't reset the toggle).
      if (patch.preinscriptionsOuvertes !== undefined) {
        payload.preinscriptionsOuvertes = patch.preinscriptionsOuvertes
      }
      await setDoc(doc(db, settingsInscriptionDoc()), payload, { merge: true })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-inscription'] })
    },
  })
}

/**
 * Dedicated toggle mutation — writes ONLY the preinscriptionsOuvertes
 * field so the admin can flip the toggle instantly without having
 * the rest of their unsaved edits in the docs editor get written.
 */
export function useTogglePreinscriptions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ouvertes: boolean) => {
      await setDoc(
        doc(db, settingsInscriptionDoc()),
        { preinscriptionsOuvertes: ouvertes },
        { merge: true }
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-inscription'] })
    },
  })
}

/**
 * Helper: given the settings, return the doc list for a chosen
 * category — or the flat list if no category was picked / no
 * categories configured.
 */
export function getDocsForCategory(
  settings: SettingsInscription,
  category: string | null
): InscriptionDocSpec[] {
  if (settings.categories && settings.categories.length > 0 && category) {
    const cat = settings.categories.find((c) => c.nom === category)
    return cat?.documents ?? []
  }
  return settings.documentsSimple ?? []
}
