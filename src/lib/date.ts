/**
 * RT-SC · Date & time helpers.
 * - Bénin timezone (Africa/Porto-Novo / Africa/Lagos = UTC+1, no DST)
 * - Absence declaration time-window guard (06:00–18:00 local)
 * - Display formatters
 */

import type { Timestamp } from 'firebase/firestore'

const BENIN_TZ = 'Africa/Porto-Novo'

// ─────────────────────────────────────────────────────────────
// Time of day in Bénin
// ─────────────────────────────────────────────────────────────

/**
 * Get the current hour in Bénin (0–23) using Intl.
 * Pure local computation, no network — fast and reliable.
 */
export function beninLocalHour(now: Date = new Date()): number {
  const hStr = new Intl.DateTimeFormat('en-US', {
    timeZone: BENIN_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(now)
  // Intl returns "0" for midnight in some browsers, "24" in others. Normalize.
  const h = parseInt(hStr, 10)
  return h === 24 ? 0 : h
}

/**
 * Bénin local "HH:MM" string.
 */
export function beninLocalHHMM(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: BENIN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h}:${m}`
}

/**
 * Bénin weekday name in French (lowercase, e.g. "lundi").
 */
export function beninJour(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: BENIN_TZ,
    weekday: 'long',
  })
    .format(now)
    .toLowerCase()
    .trim()
}

// ─────────────────────────────────────────────────────────────
// Server-time absence guard
// ─────────────────────────────────────────────────────────────

/**
 * Try to fetch the server's idea of "now" via the Date header of an HTTP HEAD.
 * Returns a Date or throws when offline / no header.
 *
 * Used as the second layer of the absence declaration guard:
 * the user's local clock can be tampered with, but the server header cannot.
 */
export async function fetchServerNow(): Promise<Date> {
  const res = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
  const dateHeader = res.headers.get('Date')
  if (!dateHeader) throw new Error('No Date header from server')
  return new Date(dateHeader)
}

export interface AbsenceWindowResult {
  allowed: boolean
  reason?: string
}

/**
 * Check whether absence declarations are currently allowed.
 * Window: 06:00 – 17:59 Bénin local time.
 *
 * Tries the server time first for tamper-resistance, falls back to local.
 */
export async function isAbsenceWindowOpen(): Promise<AbsenceWindowResult> {
  try {
    const serverNow = await fetchServerNow()
    const h = beninLocalHour(serverNow)
    if (h < 6 || h >= 18) {
      return { allowed: false, reason: 'Action rejetée par le serveur : Heure limite dépassée.' }
    }
    return { allowed: true }
  } catch {
    // Offline-strict policy from legacy: refuse rather than rely on local clock.
    return {
      allowed: false,
      reason: 'Connexion au serveur impossible. Déclaration refusée par sécurité.',
    }
  }
}

/**
 * Local-only window check (used for UI hints, not for write authorization).
 */
export function isAbsenceWindowOpenLocal(): boolean {
  const h = beninLocalHour()
  return h >= 6 && h < 18
}

// ─────────────────────────────────────────────────────────────
// Date formatters
// ─────────────────────────────────────────────────────────────

export function tsToDate(ts: Timestamp | Date | string | undefined | null): Date | null {
  if (!ts) return null
  if (ts instanceof Date) return ts
  if (typeof ts === 'string') {
    const d = new Date(ts)
    return isNaN(d.getTime()) ? null : d
  }
  // Firestore Timestamp
  if (typeof (ts as Timestamp).toDate === 'function') return (ts as Timestamp).toDate()
  return null
}

export function formatDateLong(ts: Timestamp | Date | string | undefined | null): string {
  const d = tsToDate(ts)
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateShort(ts: Timestamp | Date | string | undefined | null): string {
  const d = tsToDate(ts)
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(ts: Timestamp | Date | string | undefined | null): string {
  const d = tsToDate(ts)
  if (!d) return '—'
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** YYYY-MM-DD for <input type="date"> values and presence doc IDs */
export function todayISO(): string {
  const d = new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Convert "YYYY-MM-DD" to "12 mars 2026" */
export function dateISOtoFR(iso: string): string {
  if (!iso) return ''
  const [y, m, j] = iso.split('-')
  const mois = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${parseInt(j, 10)} ${mois[parseInt(m, 10) - 1]} ${y}`
}

// ─────────────────────────────────────────────────────────────
// Week boundaries (Lundi-Vendredi for absence quota)
// ─────────────────────────────────────────────────────────────

export interface WeekRange {
  start: Date
  end: Date
}

export function currentSchoolWeek(now: Date = new Date()): WeekRange {
  const dayOfWeek = now.getDay()  // 0=Dim, 1=Lun, ..., 6=Sam
  const diffLundi = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const start = new Date(now)
  start.setDate(now.getDate() + diffLundi)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 4)  // Vendredi
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function todayBoundaries(now: Date = new Date()): WeekRange {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}
