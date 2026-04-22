/**
 * RT-SC · Bulletin view assembler.
 *
 * Pure function that gathers the raw docs (Bulletin, Notes, Coefficients,
 * Eleve, Classe, BulletinConfig, EcoleConfig) and produces a flat,
 * display-ready `BulletinView` shape. The view is then rendered by the
 * shared <BulletinView /> component AND the PDF generator (Phase 4e),
 * so they always render exactly the same data.
 *
 * Two flavors:
 *   - assembleBulletinPeriodView  — for one (élève × period) bulletin
 *   - assembleBulletinAnnualView  — for the annual bulletin (cross-period table)
 */

import type {
  Bulletin,
  BulletinConfig,
  Classe,
  CoefficientsDoc,
  DecisionConseil,
  EcoleConfig,
  Eleve,
  Note,
  Periode,
  Professeur,
} from '@/types/models'
import { nomClasse } from '@/lib/benin'

const CONDUITE_KEY = 'Conduite'

// ─── Period bulletin view ────────────────────────────────────

export interface BulletinViewMatiereRow {
  matiere: string
  /** True if the élève abandoned this matière for this period */
  abandonne: boolean
  /** Raw interro values (used by PDF + detail view to show the breakdown).
   *  Empty array when no notes or abandonné. */
  interros: number[]
  /** M.I. (mean of interros). null if no interros entered. */
  moyenneInterros: number | null
  devoir1: number | null
  devoir2: number | null
  /** Per-matière moyenne. null when abandonné OR no notes at all. */
  moyenneMatiere: number | null
  coefficient: number
  /** moyenneMatiere * coefficient. null when abandonné. */
  totalPoints: number | null
  /** Short comment per subject. Populated by the bulletin enrichment
   *  pipeline (bulletinEnrichment.ts) — threshold-based label like
   *  "Très bien" / "Bien" / "Passable". Undefined when the engine
   *  couldn't compute a moyenne for this row. */
  appreciation?: string
  /** Student's rank within the class for THIS matière this period
   *  (e.g. "3ème/28", "1er ex/28"). Populated by enrichment; undefined
   *  on non-enriched views and when moyenne is missing. */
  rang?: string
}

export interface BulletinPeriodView {
  /* Identity */
  ecole: { nom?: string; ville?: string; devise?: string }
  anneeScolaire: string  // "2025-2026"
  classe: { nomComplet: string; niveau: string; serie?: string | null }
  eleve: {
    id: string
    nom: string
    dateNaissance: string
    genre: string
  }
  periode: Periode

  /* Body */
  matieres: BulletinViewMatiereRow[]

  /* Totals */
  totalPoints: number
  totalCoeffs: number
  moyenneGenerale: number
  rang?: string

  /* Conduite */
  noteConduite: number
  totalHeuresColle: number
  baseConduite: number
  coeffConduite: number

  /* Verdict */
  mention: 'Excellent' | 'Très bien' | 'Bien' | 'Passable' | 'Insuffisant'
  estVerrouille: boolean
  dateCalcul: string  // ISO

  /* Bulletin v2 — editor-authored fields, passed through from the Bulletin doc.
   * Present on both the base view and the enriched view (spread preserves them). */
  observationsChef?: string
  decisionConseil?: DecisionConseil

  /* Bulletin v2, Session 3 — signature artifacts.
   * Passed through from EcoleConfig + the Professeur Principal's doc so
   * BOTH the on-screen view and the PDF renderer can show them consistently.
   * All optional: missing signatures degrade gracefully to blank lines
   * (matching legacy bulletin appearance). */
  signatureDirectrice?: string
  signaturePP?: string
  /** Printed name of the Professeur Principal, shown under the signature. */
  ppNom?: string
}

export interface AssembleBulletinPeriodInput {
  bulletin: Bulletin
  notes: (Note & { id: string })[]   // every note for this élève × this period
  coefficients: CoefficientsDoc
  eleve: Eleve
  classe: Classe
  bulletinConfig: BulletinConfig
  ecoleConfig: EcoleConfig
  /** Bulletin v2, Session 3 — the class's Professeur Principal, if any.
   *  When provided, their `signature` + `nom` flow into the view so the
   *  on-screen renderer AND the PDF renderer both show the PP signature.
   *  Omitting it is always safe — the view just carries no PP signature. */
  profPrincipal?: Professeur | null
}

export function assembleBulletinPeriodView(
  input: AssembleBulletinPeriodInput
): BulletinPeriodView {
  // Build a name → note lookup
  const noteByMatiere = new Map<string, Note & { id: string }>()
  for (const n of input.notes) noteByMatiere.set(n.matiere, n)

  // Matières to display = keys in coefficients except Conduite
  const matiereKeys = Object.keys(input.coefficients)
    .filter((m) => m !== CONDUITE_KEY && input.coefficients[m] > 0)
    .sort((a, b) => a.localeCompare(b, 'fr'))

  const matieres: BulletinViewMatiereRow[] = matiereKeys.map((m) => {
    const note = noteByMatiere.get(m)
    const coefficient = input.coefficients[m]
    if (!note || note.abandonne === true) {
      return {
        matiere: m,
        abandonne: note?.abandonne === true,
        interros: [],
        moyenneInterros: null,
        devoir1: null,
        devoir2: null,
        moyenneMatiere: null,
        coefficient,
        totalPoints: null,
        appreciation: undefined,
      }
    }
    const mm = note.moyenneMatiere
    return {
      matiere: m,
      abandonne: false,
      interros: note.interros ?? [],
      moyenneInterros: note.moyenneInterros ?? null,
      devoir1: note.devoir1 ?? null,
      devoir2: note.devoir2 ?? null,
      moyenneMatiere: mm,
      coefficient,
      totalPoints: mm !== null && mm !== undefined ? mm * coefficient : null,
      appreciation: note.appreciation,
    }
  })

  return {
    ecole: {
      nom: input.ecoleConfig.nom,
      ville: input.ecoleConfig.ville,
      devise: input.ecoleConfig.devise,
    },
    anneeScolaire: input.ecoleConfig.anneeActive,
    classe: {
      nomComplet: nomClasse(input.classe),
      niveau: input.classe.niveau,
      serie: input.classe.serie ?? null,
    },
    eleve: {
      id: input.eleve.id,
      nom: input.eleve.nom,
      dateNaissance: input.eleve.date_naissance,
      genre: input.eleve.genre,
    },
    periode: input.bulletin.periode as Periode,

    matieres,

    totalPoints: input.bulletin.totalPoints,
    totalCoeffs: input.bulletin.totalCoeffs,
    moyenneGenerale: input.bulletin.moyenneGenerale,
    rang: input.bulletin.rang,

    noteConduite: input.bulletin.noteConduite,
    totalHeuresColle: input.bulletin.totalHeuresColle,
    baseConduite: input.bulletinConfig.baseConduite,
    coeffConduite: input.bulletin.coeffConduite,

    mention: mentionFor(input.bulletin.moyenneGenerale),
    estVerrouille: input.bulletin.estVerrouille,
    dateCalcul: input.bulletin.dateCalcul,

    // Bulletin v2 — forward the editor-authored fields. They're
    // optional on the source doc so we only set them when present,
    // keeping legacy bulletins untouched.
    observationsChef: input.bulletin.observationsChef,
    decisionConseil: input.bulletin.decisionConseil,

    // Bulletin v2, Session 3 — signatures + PP identity. Only set
    // when the upstream data is actually present so missing values
    // stay `undefined` (not empty strings) for predictable reads.
    signatureDirectrice: input.ecoleConfig.signatureDirectrice || undefined,
    signaturePP: input.profPrincipal?.signature || undefined,
    ppNom: input.profPrincipal?.nom || undefined,
  }
}

// ─── Annual bulletin view ────────────────────────────────────

export interface BulletinViewPeriodRow {
  periode: string
  moyenneGenerale: number
  rang?: string
  mention: BulletinPeriodView['mention']
}

export interface BulletinAnnualView {
  ecole: BulletinPeriodView['ecole']
  anneeScolaire: string
  classe: BulletinPeriodView['classe']
  eleve: BulletinPeriodView['eleve']

  /** Per-period rows feeding the annual computation */
  periodRows: BulletinViewPeriodRow[]
  /** Formula used */
  formuleUsed: 'standard' | 'simple'
  formuleLabel: string  // e.g. "(S1 + S2×2) / 3"

  /* Annual results */
  moyenneAnnuelle: number
  rangAnnuel?: string
  statutAnnuel: 'Admis' | 'Échoué'
  mention: BulletinPeriodView['mention']

  estVerrouille: boolean
  dateCalcul: string

  /* Bulletin v2, Session 3 — signature artifacts, same shape as period view. */
  signatureDirectrice?: string
  signaturePP?: string
  ppNom?: string
}

export interface AssembleBulletinAnnualInput {
  annualBulletin: Bulletin
  /** Per-period bulletins (one per period of the year) */
  periodBulletins: { periode: string; bulletin: Bulletin }[]
  eleve: Eleve
  classe: Classe
  bulletinConfig: BulletinConfig
  ecoleConfig: EcoleConfig
  /** Bulletin v2, Session 3 — Professeur Principal of the class. Optional. */
  profPrincipal?: Professeur | null
}

export function assembleBulletinAnnualView(
  input: AssembleBulletinAnnualInput
): BulletinAnnualView {
  const periodRows: BulletinViewPeriodRow[] = input.periodBulletins.map((pb) => ({
    periode: pb.periode,
    moyenneGenerale: pb.bulletin.moyenneGenerale,
    rang: pb.bulletin.rang,
    mention: mentionFor(pb.bulletin.moyenneGenerale),
  }))

  const formuleUsed =
    input.annualBulletin.formuleUsed ??
    input.bulletinConfig.formuleAnnuelle ??
    'standard'

  const formuleLabel = formulaLabelFor(
    formuleUsed,
    input.bulletinConfig.typePeriode,
    input.bulletinConfig.nbPeriodes
  )

  const moyenneAnnuelle =
    input.annualBulletin.moyenneAnnuelle ?? input.annualBulletin.moyenneGenerale

  return {
    ecole: {
      nom: input.ecoleConfig.nom,
      ville: input.ecoleConfig.ville,
      devise: input.ecoleConfig.devise,
    },
    anneeScolaire: input.ecoleConfig.anneeActive,
    classe: {
      nomComplet: nomClasse(input.classe),
      niveau: input.classe.niveau,
      serie: input.classe.serie ?? null,
    },
    eleve: {
      id: input.eleve.id,
      nom: input.eleve.nom,
      dateNaissance: input.eleve.date_naissance,
      genre: input.eleve.genre,
    },

    periodRows,
    formuleUsed,
    formuleLabel,

    moyenneAnnuelle,
    rangAnnuel: input.annualBulletin.rang,
    statutAnnuel: input.annualBulletin.statutAnnuel ?? (moyenneAnnuelle >= 10 ? 'Admis' : 'Échoué'),
    mention: mentionFor(moyenneAnnuelle),

    estVerrouille: input.annualBulletin.estVerrouille,
    dateCalcul: input.annualBulletin.dateCalcul,

    // Bulletin v2, Session 3 — signatures + PP identity (same pattern
    // as the period assembler).
    signatureDirectrice: input.ecoleConfig.signatureDirectrice || undefined,
    signaturePP: input.profPrincipal?.signature || undefined,
    ppNom: input.profPrincipal?.nom || undefined,
  }
}

// ─── Helpers ─────────────────────────────────────────────────

export function mentionFor(moyenne: number): BulletinPeriodView['mention'] {
  if (moyenne >= 16) return 'Excellent'
  if (moyenne >= 14) return 'Très bien'
  if (moyenne >= 12) return 'Bien'
  if (moyenne >= 10) return 'Passable'
  return 'Insuffisant'
}

function formulaLabelFor(
  formule: 'standard' | 'simple',
  typePeriode: 'Trimestre' | 'Semestre',
  nbPeriodes: number
): string {
  if (formule === 'simple') {
    const letters = Array.from({ length: nbPeriodes }, (_, i) =>
      `${typePeriode === 'Semestre' ? 'S' : 'T'}${i + 1}`
    )
    return `(${letters.join(' + ')}) / ${nbPeriodes}`
  }
  // standard — last period ×2
  const allButLast = Array.from({ length: nbPeriodes - 1 }, (_, i) =>
    `${typePeriode === 'Semestre' ? 'S' : 'T'}${i + 1}`
  )
  const last = `${typePeriode === 'Semestre' ? 'S' : 'T'}${nbPeriodes}`
  if (nbPeriodes === 1) return `${last}`
  return `(${[...allButLast, `${last}×2`].join(' + ')}) / ${nbPeriodes + 1}`
}
