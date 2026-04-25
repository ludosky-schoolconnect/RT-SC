/**
 * RT-SC · Inscription rendez-vous logic.
 *
 * Pure date math + Firestore-touching helpers for finding the next
 * available RV slot. Capacity is configurable per school
 * (`SettingsInscription.rendezVousPlacesParJour`, default 35).
 *
 * Algorithm (matches legacy):
 *   1. Start at `today + delaiMinJours` (default 3 days)
 *   2. If date falls on Sat/Sun, bump to Monday
 *   3. Read /rv_counters/{date}.count
 *   4. If count < cap, take the slot (atomically increment counter)
 *   5. Else advance one day, retry, max 30 attempts
 *
 * Reprogrammation flow:
 *   - Same algorithm, but starts at currentRV + 1 day
 *   - Decrements old day's counter (releases the slot for someone else)
 *   - Caps at REPROG_MAX (3) — admin-set hard limit per dossier
 */

import {
  doc,
  getDoc,
  increment,
  setDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { rvCounterDoc } from '@/lib/firestore-keys'
import { serverNow } from '@/lib/serverTime'

export const REPROG_MAX = 3
export const DEFAULT_PLACES_PAR_JOUR = 35
export const DEFAULT_DELAI_MIN_JOURS = 3
const MAX_ATTEMPTS = 30

/** Format a Date as DD/MM/YYYY (legacy display format). */
export function formatDateDDMMYYYY(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Convert DD/MM/YYYY to DD-MM-YYYY (Firestore doc id — slashes
 * disallowed in doc paths). Round-trip safe.
 */
export function dateToCounterId(ddmmyyyy: string): string {
  return ddmmyyyy.split('/').join('-')
}

/** Parse DD/MM/YYYY back to a Date. */
export function parseDDMMYYYY(s: string): Date | null {
  const parts = s.split('/')
  if (parts.length !== 3) return null
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const year = parseInt(parts[2], 10)
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null
  return new Date(year, month, day)
}

/** Skip Sat/Sun by bumping to Monday. Mutates the Date. */
function skipWeekend(d: Date): void {
  const day = d.getDay()
  if (day === 0) d.setDate(d.getDate() + 1)        // Sun → Mon
  else if (day === 6) d.setDate(d.getDate() + 2)   // Sat → Mon
}

export interface FindSlotResult {
  date: Date
  dateDisplay: string
}

/**
 * Find the next RV slot starting from `startDate` (inclusive),
 * skipping weekends and full days. Atomically increments the counter
 * once a slot is found.
 *
 * Returns null if no slot found within MAX_ATTEMPTS days.
 */
export async function findNextSlot(
  startDate: Date,
  capacity: number
): Promise<FindSlotResult | null> {
  const cur = new Date(startDate.getTime())

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    skipWeekend(cur)
    const display = formatDateDDMMYYYY(cur)
    const counterId = dateToCounterId(display)

    const ref = doc(db, rvCounterDoc(counterId))
    const snap = await getDoc(ref)
    const taken = snap.exists() ? Number(snap.data().count) || 0 : 0

    if (taken < capacity) {
      // Take it — atomic increment via setDoc with merge.
      // Firestore's increment() is server-side atomic, so concurrent
      // submissions don't both grab the last slot.
      await setDoc(ref, { count: increment(1) }, { merge: true })
      return { date: new Date(cur.getTime()), dateDisplay: display }
    }

    // Day full — advance one day
    cur.setDate(cur.getDate() + 1)
  }

  return null
}

/**
 * Release a previously-claimed slot (decrement counter).
 * Used during reprogrammation to free up the old day.
 *
 * Best-effort — if the decrement fails (rules denial, network error)
 * we don't block the caller. The over-counted day will just have one
 * "ghost" slot until admin manually adjusts. Better than blocking the
 * parent reprogrammation.
 */
export async function releaseSlot(dateDisplay: string): Promise<void> {
  try {
    const counterId = dateToCounterId(dateDisplay)
    await setDoc(
      doc(db, rvCounterDoc(counterId)),
      { count: increment(-1) },
      { merge: true }
    )
  } catch (e) {
    console.warn('[releaseSlot] non-fatal:', e)
  }
}

/**
 * Compute the earliest legal start date given today + delaiMinJours.
 */
export function computeEarliestStartDate(delaiMinJours: number): Date {
  const d = serverNow()
  d.setDate(d.getDate() + Math.max(1, delaiMinJours))
  d.setHours(0, 0, 0, 0)
  return d
}
