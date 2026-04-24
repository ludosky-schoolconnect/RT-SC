/**
 * RT-SC · Civisme hooks (v3 — cumulative balance model).
 *
 * Civisme is now a CUMULATIVE LIFETIME BALANCE, not a graded score.
 * Students earn points by doing quests (Phase 2), spend them on
 * rewards from the catalog (Phase 3). Bad behavior subtracts via
 * incident reports (Phase 3).
 *
 * Range: [-10, +999]
 *   - Floor (-10) prevents theatrically-negative scores that would
 *     undermine credibility.
 *   - Ceiling (+999) is a sanity guard against typos/runaway awards;
 *     no realistic student should ever hit it.
 *
 * Tiers (engagement-based, not "grade"-based):
 *   critical   < 0      — Intervention requise
 *   neutral    0-9      — Nouveau / Peu actif
 *   engaged    10-49    — Engagé
 *   committed  50-99    — Investi
 *   exemplary  100+     — Pilier de la communauté
 *
 * Tiers exist purely for UI coloring and badge display. There is NO
 * built-in "honor certificate" anymore — admin can add a "Certificat
 * d'Honneur" entry to the rewards catalog if they want one.
 *
 * Read: piggy-backs on the existing useEleves hook.
 *
 * Write: useAdjustCivisme is preserved for the +/-1 admin buttons
 * (manual ajustement). Quest awards, redemptions, and incidents
 * use dedicated mutations (Phases 2 & 3) that also write to the
 * civismeHistory subcollection.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  collection, doc, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { civismeHistoryCol, eleveDoc } from '@/lib/firestore-keys'
import { useAuthStore } from '@/stores/auth'
import type { Eleve } from '@/types/models'

export const CIVISME_FLOOR = -10
export const CIVISME_CEILING = 999

export interface AdjustCivismeInput {
  classeId: string
  eleveId: string
  /** Delta to apply — clamped to [CIVISME_FLOOR, CIVISME_CEILING] */
  delta: number
  /** Current value on the eleve doc (undefined → treated as 0) */
  currentValue: number | undefined
}

export function useAdjustCivisme() {
  const qc = useQueryClient()
  const profil = useAuthStore((s) => s.profil)

  return useMutation({
    mutationFn: async (input: AdjustCivismeInput): Promise<number> => {
      const current = input.currentValue ?? 0
      const next = Math.max(
        CIVISME_FLOOR,
        Math.min(CIVISME_CEILING, current + input.delta)
      )
      if (next === current) return current

      const eleveRef = doc(db, eleveDoc(input.classeId, input.eleveId))
      const historyRef = doc(
        collection(db, civismeHistoryCol(input.classeId, input.eleveId))
      )

      await runTransaction(db, async (tx) => {
        tx.update(eleveRef, { civismePoints: next })
        tx.set(historyRef, {
          delta: input.delta,
          raison: 'ajustement_manuel',
          date: serverTimestamp(),
          parUid: profil?.id ?? 'admin',
          ...(profil?.nom ? { parNom: profil.nom } : {}),
          soldeApres: next,
        })
      })
      return next
    },

    onMutate: async (input) => {
      const key = ['eleves', input.classeId]
      await qc.cancelQueries({ queryKey: key })

      const previous = qc.getQueryData<Eleve[]>(key)
      const current = input.currentValue ?? 0
      const next = Math.max(
        CIVISME_FLOOR,
        Math.min(CIVISME_CEILING, current + input.delta)
      )

      qc.setQueryData<Eleve[]>(key, (old) => {
        if (!old) return old
        return old.map((e) =>
          e.id === input.eleveId ? { ...e, civismePoints: next } : e
        )
      })

      return { previous }
    },

    onError: (_err, input, context) => {
      if (context?.previous) {
        qc.setQueryData(['eleves', input.classeId], context.previous)
      }
    },

    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ['eleves', input.classeId] })
    },
  })
}

// ─── Tier system ──────────────────────────────────────────────

export type CivismeTier =
  | 'critical'
  | 'neutral'
  | 'engaged'
  | 'committed'
  | 'exemplary'

export function civismeTier(points: number | undefined): CivismeTier {
  const p = points ?? 0
  if (p < 0) return 'critical'
  if (p < 10) return 'neutral'
  if (p < 50) return 'engaged'
  if (p < 100) return 'committed'
  return 'exemplary'
}

export interface TierMetadata {
  /** Short label for badges / chips */
  label: string
  /** Detailed line for the hero "what does this mean" */
  blurb: string
  /** Minimum points to enter this tier */
  threshold: number
  /** Next tier's threshold, if any (null for top tier) */
  nextThreshold: number | null
}

export const TIER_METADATA: Record<CivismeTier, TierMetadata> = {
  critical: {
    label: 'Intervention requise',
    blurb:
      "Des points de rappel ont été émis. Parlez-en avec votre enseignant ou la direction pour repartir du bon pied.",
    threshold: -10,
    nextThreshold: 0,
  },
  neutral: {
    label: 'Nouveau',
    blurb:
      "Vous démarrez votre parcours civique. Prenez votre première quête pour commencer à accumuler des points.",
    threshold: 0,
    nextThreshold: 10,
  },
  engaged: {
    label: 'Engagé',
    blurb:
      "Vous contribuez activement à la vie de l'école. Continuez vos efforts pour atteindre le palier suivant.",
    threshold: 10,
    nextThreshold: 50,
  },
  committed: {
    label: 'Investi',
    blurb:
      "Votre engagement se remarque. Vous êtes un membre solide de la communauté.",
    threshold: 50,
    nextThreshold: 100,
  },
  exemplary: {
    label: 'Pilier',
    blurb:
      "Bravo ! Vous êtes un pilier de la communauté scolaire. Votre exemple compte.",
    threshold: 100,
    nextThreshold: null,
  },
}

/**
 * Compute distance to next tier — used for the "Plus que X pts pour
 * atteindre Y" progress display in the student hero.
 *
 * Returns null when the student is at the top tier (exemplary) or
 * critical (negative — different language needed there).
 */
export function distanceToNextTier(
  points: number | undefined
): { remaining: number; nextLabel: string } | null {
  const tier = civismeTier(points)
  if (tier === 'critical' || tier === 'exemplary') return null
  const meta = TIER_METADATA[tier]
  if (meta.nextThreshold === null) return null
  const nextTier = civismeTier(meta.nextThreshold)
  return {
    remaining: meta.nextThreshold - (points ?? 0),
    nextLabel: TIER_METADATA[nextTier].label,
  }
}

/**
 * Format points as a display string.
 *
 * The new convention is "X pts" or "0 pt" — no /20, no fixed scale.
 * Negative values render with a minus sign.
 */
export function formatCivismePoints(points: number | undefined): string {
  const p = points ?? 0
  return `${p} ${Math.abs(p) === 1 ? 'pt' : 'pts'}`
}
