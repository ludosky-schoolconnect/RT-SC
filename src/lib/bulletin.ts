/**
 * RT-SC · Bulletin computations.
 * Pure functions, no Firebase, no React. Easy to unit-test.
 *
 * All formulas mirror the legacy app.js exactly.
 */

import type { Genre } from '@/types/models'
import { ordinalRang } from './benin'
import { serverNow } from '@/lib/serverTime'

// ─────────────────────────────────────────────────────────────
// Per-subject (per-période)
// ─────────────────────────────────────────────────────────────

/** M.I. = mean of interrogation notes; null if none */
export function moyenneInterros(interros: number[]): number | null {
  if (!interros || interros.length === 0) return null
  const sum = interros.reduce((a, b) => a + b, 0)
  return sum / interros.length
}

/**
 * Moyenne matière = average of the COMPONENTS PRESENT.
 * Components are [M.I., dev1, dev2], filtering out null/undefined.
 *
 * Behaviors:
 * - Only interros: mean = M.I.
 * - Only dev1+dev2: mean = (dev1+dev2)/2
 * - All three: mean = (M.I.+dev1+dev2)/3
 * - Nothing: returns null → caller should SKIP this subject
 *
 * Callers pass `{ moyenneInterros, devoir1, devoir2 }` so the order
 * isn't ambiguous and additions don't break existing call sites.
 */
export function moyenneMatiere(args: {
  moyenneInterros: number | null
  devoir1: number | null | undefined
  devoir2: number | null | undefined
}): number | null {
  const components: number[] = []
  if (args.moyenneInterros !== null && args.moyenneInterros !== undefined) {
    components.push(args.moyenneInterros)
  }
  if (args.devoir1 !== null && args.devoir1 !== undefined) {
    components.push(args.devoir1)
  }
  if (args.devoir2 !== null && args.devoir2 !== undefined) {
    components.push(args.devoir2)
  }
  if (components.length === 0) return null
  return components.reduce((a, b) => a + b, 0) / components.length
}

/** Total points contribution = moyMatière × coefficient */
export function moyenneFoisCoeff(moyenne: number | null, coeff: number | null): number | null {
  if (moyenne === null || coeff === null || coeff === undefined) return null
  return moyenne * coeff
}

// ─────────────────────────────────────────────────────────────
// Conduite
// ─────────────────────────────────────────────────────────────

/**
 * Conduite penalty: each 2 hours of colle = 1 point off the base.
 * Floored at 0. baseConduite default is 20.
 */
export function noteConduite(baseConduite: number, totalHeuresColle: number): number {
  return Math.max(0, baseConduite - totalHeuresColle / 2)
}

// ─────────────────────────────────────────────────────────────
// Per-student (PP closure)
// ─────────────────────────────────────────────────────────────

export interface ClosedSubject {
  matiere: string
  moyenneMatiere: number  // assumed estCloture, non-null
  coeff: number           // > 0 only
}

export interface MoyenneGeneraleResult {
  totalPoints: number
  totalCoeffs: number
  moyenneGenerale: number
}

/**
 * Compute the moyenne générale for a student in a given period.
 * Includes the conduite as one more weighted line.
 *
 * Note: the caller is responsible for filtering out matières the élève
 * abandoned (`Note.abandonne === true`) before constructing the
 * `closedSubjects` array. Abandoned matières must NOT contribute to
 * moyenneGenerale and must NOT count in totalCoeffs.
 */
export function moyenneGenerale(args: {
  closedSubjects: ClosedSubject[]
  noteConduite: number
  coeffConduite: number
}): MoyenneGeneraleResult {
  let totalPoints = args.noteConduite * args.coeffConduite
  let totalCoeffs = args.coeffConduite

  for (const s of args.closedSubjects) {
    totalPoints += s.moyenneMatiere * s.coeff
    totalCoeffs += s.coeff
  }

  return {
    totalPoints,
    totalCoeffs,
    moyenneGenerale: totalCoeffs > 0 ? totalPoints / totalCoeffs : 0,
  }
}

// ─────────────────────────────────────────────────────────────
// Annual mean (Bénin standard, configurable)
// ─────────────────────────────────────────────────────────────

/**
 * The configurable formula for combining per-period moyennes into an
 * annual moyenne. Default 'standard' uses the Bénin convention where
 * the LAST period weights double:
 *   - 2 periods (semestre): (S1 + S2*2) / 3
 *   - 3 periods (trimestre): (T1 + T2 + T3*2) / 4
 *
 * 'simple' is a plain arithmetic mean of all periods, equally weighted.
 */
export type FormuleAnnuelle = 'standard' | 'simple'

/**
 * Compute the annual moyenne from an array of per-period moyennes.
 *
 * The array is in chronological order. If any period is missing
 * (caller's responsibility to check), this returns NaN — the orchestrator
 * preflights for completeness before calling.
 */
export function moyenneAnnuelle(
  periodMoyennes: number[],
  formule: FormuleAnnuelle = 'standard'
): number {
  if (periodMoyennes.length === 0) return NaN
  if (formule === 'simple') {
    const sum = periodMoyennes.reduce((a, b) => a + b, 0)
    return Number((sum / periodMoyennes.length).toFixed(2))
  }
  // standard: last period weights double
  const last = periodMoyennes[periodMoyennes.length - 1]
  const others = periodMoyennes.slice(0, -1)
  const totalPoints = others.reduce((a, b) => a + b, 0) + last * 2
  const totalWeight = others.length + 2
  return Number((totalPoints / totalWeight).toFixed(2))
}

export function statutAnnuel(moyenne: number): 'Admis' | 'Échoué' {
  return moyenne >= 10 ? 'Admis' : 'Échoué'
}

// ─────────────────────────────────────────────────────────────
// Ranking
// ─────────────────────────────────────────────────────────────

export interface RankInput {
  id: string
  moyenneGenerale: number
  genre: Genre | string
}

export interface RankResult {
  id: string
  rang: string  // e.g. "3ème/45", "1er/45", "1ère ex/45"
  rangNumber: number
  isExAequo: boolean
}

/**
 * Compute the rank string for each student in a class.
 * Rules:
 * - Sort by moyenne desc.
 * - First place: "1er" or "1ère" depending on genre.
 * - Others: "Nème".
 * - Equal moyennes share the same rank, suffixed " ex".
 * - Next rank after a tie skips correctly (1, 1 ex, 3...).
 */
export function computeRanking(input: RankInput[]): RankResult[] {
  const sorted = [...input].sort((a, b) => b.moyenneGenerale - a.moyenneGenerale)
  const total = sorted.length
  const results: RankResult[] = []

  let currentRank = 1
  for (let i = 0; i < sorted.length; i++) {
    const prev = i > 0 ? sorted[i - 1] : null

    // Drop rank only when this student's moy is STRICTLY less than the previous
    if (prev && sorted[i].moyenneGenerale < prev.moyenneGenerale) {
      currentRank = i + 1
    }

    const isExAequo = !!prev && sorted[i].moyenneGenerale === prev.moyenneGenerale
    let rangStr = ordinalRang(currentRank, sorted[i].genre)
    if (isExAequo) rangStr += ' ex'

    results.push({
      id: sorted[i].id,
      rang: `${rangStr}/${total}`,
      rangNumber: currentRank,
      isExAequo,
    })
  }

  return results
}

// ─────────────────────────────────────────────────────────────
// Vigilance IA (auto-analysis on every note save)
// ─────────────────────────────────────────────────────────────

export interface VigilanceInput {
  interros: number[]
  devoir1: number | null | undefined
  devoir2: number | null | undefined
  nomEleve: string
}

export type VigilanceResult =
  | { type: 'success' | 'warning' | 'danger'; message: string }
  | null

/**
 * Build the vigilance message and severity based on note pattern.
 * Returns null when no notes exist (don't write anything).
 */
export function analyserTrajectoire(input: VigilanceInput): VigilanceResult {
  const { interros, devoir1: d1, devoir2: d2, nomEleve } = input
  const firstName = (nomEleve || '').split(' ')[0]

  // Tier 1 — interros trend
  let msgInterro = ''
  if (interros.length >= 2) {
    const last = interros[interros.length - 1]
    const previous = interros.slice(0, -1)
    const prevAvg = previous.reduce((a, b) => a + b, 0) / previous.length
    if (prevAvg > 0) {
      const pct = Math.round(((last - prevAvg) / prevAvg) * 100)
      if (pct < 0) {
        msgInterro = `La dernière note d'interrogation de ${firstName} a chuté de ${Math.abs(
          pct
        )}% par rapport à sa moyenne habituelle.`
      } else if (pct > 0) {
        msgInterro = `La dernière note d'interrogation a augmenté de ${pct}% par rapport à sa moyenne habituelle.`
      } else {
        msgInterro = "Les notes d'interrogation sont restées stables par rapport à sa moyenne."
      }
    }
  }

  // Tier 2 — devoir delta in points
  let msgDevoir = ''
  if (d1 !== null && d1 !== undefined && d2 !== null && d2 !== undefined) {
    const diff = d2 - d1
    if (diff <= -2) msgDevoir = `La dernière note de devoir a chuté de ${Math.abs(diff)} points.`
    else if (diff >= 2) msgDevoir = `La dernière note de devoir a augmenté de ${diff} points.`
    else msgDevoir = 'La note de devoir est restée relativement stable.'
  }

  // Tier 3 — overall health
  let totalSum = 0
  let totalCount = 0
  if (d1 !== null && d1 !== undefined) {
    totalSum += d1
    totalCount++
  }
  if (d2 !== null && d2 !== undefined) {
    totalSum += d2
    totalCount++
  }
  for (const n of interros) {
    totalSum += n
    totalCount++
  }

  if (totalCount === 0) return null

  const avg = totalSum / totalCount
  let type: 'success' | 'warning' | 'danger'
  let msgSante: string
  if (avg >= 12) {
    type = 'success'
    msgSante = 'La santé globale de ses notes est stable.'
  } else if (avg >= 10) {
    type = 'warning'
    msgSante = 'La santé globale de ses notes est fragile.'
  } else {
    type = 'danger'
    msgSante = 'La santé globale de ses notes est en danger.'
  }

  const finalParts = [msgInterro, msgDevoir, msgSante].filter(Boolean)
  return {
    type,
    message: finalParts.join(' '),
  }
}

// ─────────────────────────────────────────────────────────────
// Auto-appreciation (silent comment based on dev1/dev2/interros)
// Mirrors legacy `genererAppreciationSilencieuse`
// ─────────────────────────────────────────────────────────────

export function genererAppreciation(
  d1: number | null | undefined,
  d2: number | null | undefined,
  interros: number[]
): string {
  const all: number[] = []
  if (d1 !== null && d1 !== undefined) all.push(d1)
  if (d2 !== null && d2 !== undefined) all.push(d2)
  for (const n of interros) all.push(n)
  if (all.length === 0) return ''
  const avg = all.reduce((a, b) => a + b, 0) / all.length

  if (avg >= 16) return 'Excellents résultats. Continuez ainsi.'
  if (avg >= 14) return 'Très bons résultats. Travail sérieux.'
  if (avg >= 12) return 'Bons résultats. Peut encore progresser.'
  if (avg >= 10) return 'Résultats passables. Doit fournir plus d’efforts.'
  if (avg >= 8) return 'Résultats insuffisants. Travail à intensifier.'
  return 'Résultats très faibles. Reprise sérieuse nécessaire.'
}

// ─────────────────────────────────────────────────────────────
// Baromètre (class temperature for one matière in one période)
// ─────────────────────────────────────────────────────────────

export interface BarometreEntry {
  nom: string
  moy: number
}

export interface BarometreStats {
  totalNotes: number
  moyenneClasse: number
  meilleur: BarometreEntry
  plusBas: BarometreEntry
  nbDessus10: number
  nbDessous10: number
  tauxReussite: number  // 0–100
  label: 'Excellent' | 'Passable' | 'Insuffisant'
  couleur: '#10b981' | '#f59e0b' | '#ef4444'
}

export function calculerBarometre(notes: BarometreEntry[]): BarometreStats | null {
  if (notes.length === 0) return null

  const sorted = [...notes].sort((a, b) => a.moy - b.moy)
  const moyenneClasse = notes.reduce((acc, n) => acc + n.moy, 0) / notes.length
  const nbDessus10 = notes.filter((n) => n.moy >= 10).length
  const nbDessous10 = notes.filter((n) => n.moy < 10).length
  const tauxReussite = Math.round((nbDessus10 / notes.length) * 100)

  let label: BarometreStats['label']
  let couleur: BarometreStats['couleur']
  if (moyenneClasse >= 14) {
    label = 'Excellent'
    couleur = '#10b981'
  } else if (moyenneClasse >= 10) {
    label = 'Passable'
    couleur = '#f59e0b'
  } else {
    label = 'Insuffisant'
    couleur = '#ef4444'
  }

  return {
    totalNotes: notes.length,
    moyenneClasse,
    meilleur: sorted[sorted.length - 1],
    plusBas: sorted[0],
    nbDessus10,
    nbDessous10,
    tauxReussite,
    label,
    couleur,
  }
}

// ─────────────────────────────────────────────────────────────
// Period helpers (Trimestre / Semestre)
// ─────────────────────────────────────────────────────────────

/**
 * The list of period names for a given config, e.g.
 *   listPeriodes('Trimestre', 3) → ['Trimestre 1', 'Trimestre 2', 'Trimestre 3']
 */
export function listPeriodes(
  typePeriode: 'Trimestre' | 'Semestre',
  nbPeriodes: number
): string[] {
  const out: string[] = []
  for (let i = 1; i <= nbPeriodes; i++) {
    out.push(`${typePeriode} ${i}`)
  }
  return out
}

/**
 * Compute which period today falls in.
 *
 * If `periodeDates` is provided (admin has configured explicit start/end
 * dates per period in the bulletin config), uses that — most accurate.
 * If today falls in a gap between periods, returns the next upcoming
 * period. Before all periods → first; after all → last.
 *
 * Falls back to a Bénin school calendar guess when no dates are set.
 *   Trimestre: Oct-Dec / Jan-Mar / Apr-Jun
 *   Semestre: Oct-Jan / Feb-Jun
 *   Off-season (Jul-Sep): returns the LAST period.
 */
export function currentPeriode(
  typePeriode: 'Trimestre' | 'Semestre',
  nbPeriodes: number,
  now: Date = serverNow(),
  periodeDates?: Record<string, { debut: string; fin: string }>
): string {
  const periodes = listPeriodes(typePeriode, nbPeriodes)

  // ── Path 1: explicit dates ──
  if (periodeDates && Object.keys(periodeDates).length > 0) {
    const todayStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
    type Window = { name: string; debut: string; fin: string }
    const windows: Window[] = []
    for (const name of periodes) {
      const r = periodeDates[name]
      if (r?.debut && r?.fin) windows.push({ name, debut: r.debut, fin: r.fin })
    }

    if (windows.length > 0) {
      // Sort by start date so we can scan in order
      windows.sort((a, b) => a.debut.localeCompare(b.debut))

      // 1a. Today within one of the windows (inclusive)
      for (const w of windows) {
        if (todayStr >= w.debut && todayStr <= w.fin) return w.name
      }

      // 1b. Today is before the first → first period
      if (todayStr < windows[0].debut) return windows[0].name

      // 1c. Today is after the last → last period
      const last = windows[windows.length - 1]
      if (todayStr > last.fin) return last.name

      // 1d. Today is in a gap between periods → return the next upcoming
      for (let i = 0; i < windows.length - 1; i++) {
        if (todayStr > windows[i].fin && todayStr < windows[i + 1].debut) {
          return windows[i + 1].name
        }
      }

      // Defensive fallback (shouldn't reach here)
      return windows[0].name
    }
    // If periodeDates exists but is empty/invalid, fall through to guess.
  }

  // ── Path 2: Bénin calendar guess ──
  const month = now.getMonth() + 1 // 1-12

  if (typePeriode === 'Trimestre' && nbPeriodes === 3) {
    if (month >= 10) return periodes[0] // Oct-Dec
    if (month >= 1 && month <= 3) return periodes[1]
    if (month >= 4 && month <= 6) return periodes[2]
    return periodes[nbPeriodes - 1]
  }

  if (typePeriode === 'Semestre' && nbPeriodes === 2) {
    if (month >= 10 || month <= 1) return periodes[0]
    if (month >= 2 && month <= 6) return periodes[1]
    return periodes[nbPeriodes - 1]
  }

  // Fallback: even split starting from October
  const monthsSinceOct = (month - 10 + 12) % 12
  const periodLength = 12 / nbPeriodes
  const idx = Math.min(Math.floor(monthsSinceOct / periodLength), nbPeriodes - 1)
  return periodes[idx]
}
