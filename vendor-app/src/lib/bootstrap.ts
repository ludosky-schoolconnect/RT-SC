/**
 * Vendor · School bootstrap logic.
 *
 * Takes a fresh Firebase project (brand new, empty Firestore) and
 * seeds it with everything RT-SC expects on first launch:
 *
 *   1. Auth user for the school admin (email + password)
 *   2. /professeurs/{uid} doc with role='admin', statut='actif'
 *   3. /ecole/config — school identity + active year
 *   4. /ecole/bulletinConfig — trimester defaults
 *   5. /ecole/finances — fee structure defaults
 *   6. /ecole/securite — passkeys for prof/caissier signup
 *   7. /ecole/subscription — SaaS subscription deadline + vendor config
 *   8. /ecole/matieres — empty list (admin fills later via Classes tab)
 *   9. /ecole/examens — empty map (admin fills later)
 *
 * All writes are batched so the school either comes up fully
 * initialized or not at all — no half-bootstrap leftover if something
 * fails midway.
 *
 * Idempotency: if the admin already exists (fresh Auth user creation
 * fails with auth/email-already-in-use), we surface that clearly
 * rather than silently skipping — better to force a human decision.
 */

import {
  createUserWithEmailAndPassword,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  getDoc,
  type Firestore,
} from 'firebase/firestore'

export interface BootstrapInput {
  /** Display name, e.g. "CEG HOUETO" */
  schoolName: string
  /** City */
  ville: string
  /** Currency display symbol, e.g. "F" or "FCFA" */
  devise: string
  /** Postal/street address for receipts */
  adresse: string
  /** Main contact phone, stored as digits only (13 for Benin E.164) */
  telephone: string
  /** Academic year string, e.g. "2026-2027" */
  anneeActive: string
  /** Admin email (will be created in Firebase Auth) */
  adminEmail: string
  /** Admin password (≥6 chars, Firebase Auth minimum) */
  adminPassword: string
  /** Admin display name on the /professeurs doc */
  adminNom: string
  /** 6-digit passkey for prof signup */
  passkeyProf: string
  /** 6-digit passkey for caissier signup (optional, falls back to passkeyProf if empty) */
  passkeyCaisse?: string
  /** Initial scolarité annual fee (FCFA) */
  scolarite: number
  /** Frais annexes annual (FCFA) */
  fraisAnnexes: number
  /** Whether Premier cycle girls pay no scolarité */
  gratuiteFilles1er: boolean
  /** Whether Second cycle girls pay no scolarité */
  gratuiteFilles2nd: boolean
  /** Subscription days from now before the school is locked */
  subscriptionDays: number
  /** Subscription renewal price in FCFA */
  subscriptionPrice: number
  /** Subscription cycle duration in months */
  subscriptionDurationMonths: number
  /** FedaPay public key (optional for now, can set later) */
  fedaPayPublicKey?: string
  /** Vendor WhatsApp (international, no +) for LockedPage support link */
  supportWhatsAppNumber?: string
}

export interface BootstrapResult {
  adminUid: string
  adminEmail: string
  docsWritten: string[]
}

/**
 * Check whether the target Firebase project already has a bootstrapped
 * school. We consider it bootstrapped if /ecole/config exists.
 *
 * Calling this BEFORE createUserWithEmailAndPassword lets us warn the
 * vendor before creating an orphaned Auth user on a school that's
 * already set up.
 */
export async function isAlreadyBootstrapped(
  db: Firestore
): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'ecole', 'config'))
    return snap.exists()
  } catch (err) {
    // Permissions error usually means rules haven't been deployed yet
    // — treat as "not bootstrapped" and let the bootstrap flow proceed
    // (Firestore rules will reject the writes cleanly if they're
    // locked down, and we'll surface the error).
    console.warn('[bootstrap] isAlreadyBootstrapped check failed:', err)
    return false
  }
}

/**
 * Run the full bootstrap. Order matters:
 *   1. Create Auth user FIRST — if it fails (email taken, weak password),
 *      we bail before touching Firestore.
 *   2. Batch-write all Firestore seed docs in one atomic commit.
 *
 * If step 2 fails after step 1 succeeded, the Auth user is orphaned.
 * We surface a specific error so the vendor knows to delete the user
 * from Firebase Console before retrying.
 */
export async function bootstrapSchool(
  auth: Auth,
  db: Firestore,
  input: BootstrapInput
): Promise<BootstrapResult> {
  // ─── 1. Create admin Auth user ─────────────────────────────
  let user: User
  try {
    const cred = await createUserWithEmailAndPassword(
      auth,
      input.adminEmail,
      input.adminPassword
    )
    user = cred.user
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'auth/email-already-in-use') {
      throw new Error(
        `L'email ${input.adminEmail} est déjà enregistré. Supprimez l'utilisateur dans Firebase Console, ou utilisez un autre email.`
      )
    }
    if (code === 'auth/weak-password') {
      throw new Error(
        'Mot de passe trop faible. Firebase exige au moins 6 caractères.'
      )
    }
    if (code === 'auth/invalid-email') {
      throw new Error(`Email invalide: ${input.adminEmail}`)
    }
    throw err
  }

  // ─── 2. Batch-write all seed docs ──────────────────────────
  const batch = writeBatch(db)
  const written: string[] = []

  // /professeurs/{adminUid}
  batch.set(doc(db, 'professeurs', user.uid), {
    nom: input.adminNom,
    email: input.adminEmail,
    matieres: [],
    classesIds: [],
    role: 'admin',
    statut: 'actif',
    createdAt: serverTimestamp(),
  })
  written.push(`professeurs/${user.uid}`)

  // /ecole/config
  batch.set(doc(db, 'ecole', 'config'), {
    anneeActive: input.anneeActive,
    nom: input.schoolName,
    ville: input.ville,
    devise: input.devise,
    adresse: input.adresse,
    telephone: input.telephone,
    nbEleves: 0,
    nbClasses: 0,
  })
  written.push('ecole/config')

  // /ecole/bulletinConfig — Bénin default: 3 trimestres, conduite /20
  batch.set(doc(db, 'ecole', 'bulletinConfig'), {
    typePeriode: 'Trimestre',
    nbPeriodes: 3,
    baseConduite: 20,
    formuleAnnuelle: 'standard',
  })
  written.push('ecole/bulletinConfig')

  // /ecole/finances
  batch.set(doc(db, 'ecole', 'finances'), {
    scolarite: input.scolarite,
    fraisAnnexes: input.fraisAnnexes,
    gratuiteFilles1er: input.gratuiteFilles1er,
    gratuiteFilles2nd: input.gratuiteFilles2nd,
  })
  written.push('ecole/finances')

  // /ecole/securite — passkeys for staff signup
  batch.set(doc(db, 'ecole', 'securite'), {
    passkeyProf: input.passkeyProf,
    passkeyCaisse: input.passkeyCaisse || input.passkeyProf,
  })
  written.push('ecole/securite')

  // /ecole/subscription
  const deadlineMs = Date.now() + input.subscriptionDays * 86_400_000
  batch.set(doc(db, 'ecole', 'subscription'), {
    deadline: Timestamp.fromMillis(deadlineMs),
    isManualLock: false,
    hasRequestedUnlock: false,
    subscriptionPrice: input.subscriptionPrice,
    subscriptionDurationMonths: input.subscriptionDurationMonths,
    fedaPayPublicKey: input.fedaPayPublicKey || '',
    supportWhatsAppNumber: input.supportWhatsAppNumber || '',
  })
  written.push('ecole/subscription')

  // /ecole/matieres — starts empty, admin fills via Classes tab
  batch.set(doc(db, 'ecole', 'matieres'), {
    liste: [],
  })
  written.push('ecole/matieres')

  // /ecole/examens — starts empty
  batch.set(doc(db, 'ecole', 'examens'), {})
  written.push('ecole/examens')

  // /settings_inscription/config — inscription form defaults
  batch.set(doc(db, 'settings_inscription', 'config'), {
    ouvert: true,
    messageFerme:
      "Les inscriptions sont actuellement fermées. Revenez bientôt.",
    createdAt: serverTimestamp(),
  })
  written.push('settings_inscription/config')

  try {
    await batch.commit()
  } catch (err) {
    throw new Error(
      `Les écritures Firestore ont échoué. L'utilisateur Auth ${input.adminEmail} a été créé mais est orphelin — supprimez-le dans Firebase Console avant de réessayer. Détail: ${(err as Error).message}`
    )
  }

  return {
    adminUid: user.uid,
    adminEmail: input.adminEmail,
    docsWritten: written,
  }
}

/**
 * Derive sensible bootstrap defaults from the school name for
 * pre-filling the form. These are starting points — the vendor can
 * override any field in the UI.
 */
export function suggestDefaults(
  schoolName?: string
): Partial<BootstrapInput> {
  const thisYear = new Date().getFullYear()
  const currentYear = new Date().getMonth() >= 8 ? thisYear : thisYear - 1
  return {
    schoolName: schoolName ?? '',
    ville: '',
    devise: 'F',
    adresse: '',
    telephone: '',
    anneeActive: `${currentYear}-${currentYear + 1}`,
    passkeyProf: randomPasskey(),
    passkeyCaisse: randomPasskey(),
    scolarite: 60_000,
    fraisAnnexes: 10_000,
    gratuiteFilles1er: false,
    gratuiteFilles2nd: false,
    subscriptionDays: 30,
    subscriptionPrice: 15_000,
    subscriptionDurationMonths: 1,
    supportWhatsAppNumber: '',
  }
}

function randomPasskey(): string {
  // 6-digit number, always 6 chars (leading zero preserved)
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')
}
