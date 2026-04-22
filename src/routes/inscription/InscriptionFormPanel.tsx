/**
 * RT-SC · Public inscription form panel.
 *
 * Multi-step linear form:
 *   1. Identity (nom, genre, date_naissance, niveauSouhaite, contactParent)
 *   2. Category picker (only if settings has categories configured)
 *   3. Documents per category (or flat list if no categories)
 *   4. Review + submit
 *   5. Success screen with tracking code
 *
 * On submit:
 *   - addDoc /pre_inscriptions (with all identity fields + trackingCode)
 *   - For each file: prepareDoc (compress) → uploadPreparedDoc
 *   - Show tracking code prominently + instructions to save it
 */

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileText,
  Info,
  Phone,
  Mail,
  Upload,
  User,
} from 'lucide-react'
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { preInscriptionsCol } from '@/lib/firestore-keys'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import {
  getDocsForCategory,
  useSettingsInscription,
} from '@/hooks/useSettingsInscription'
import {
  prepareDoc,
  uploadPreparedDoc,
  type PreparedDoc,
} from '@/lib/inscription-doc-storage'
import { genererTrackingCode } from '@/lib/benin'
import { cn } from '@/lib/cn'
import type { Genre } from '@/types/models'

const NIVEAUX = [
  '6ème',
  '5ème',
  '4ème',
  '3ème',
  '2nde',
  '1ère',
  'Terminale',
] as const

interface FormState {
  nom: string
  genre: Genre | ''
  dateNaissance: string
  niveauSouhaite: string
  contactParent: string
  emailParent: string
  categorie: string
  /** docName → File (picked by user; not yet compressed/uploaded) */
  files: Record<string, File | null>
}

const EMPTY_FORM: FormState = {
  nom: '',
  genre: '',
  dateNaissance: '',
  niveauSouhaite: '',
  contactParent: '',
  emailParent: '',
  categorie: '',
  files: {},
}

export function InscriptionFormPanel() {
  const { data: settings, isLoading: loadingSettings } = useSettingsInscription()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ code: string } | null>(null)

  const categories = settings?.categories ?? []
  const hasCategories = categories.length > 0
  const requiredDocs = useMemo(() => {
    if (!settings) return []
    return getDocsForCategory(
      settings,
      hasCategories ? form.categorie || null : null
    )
  }, [settings, hasCategories, form.categorie])

  const materiel = settings?.materiel ?? []

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setFile(docName: string, file: File | null) {
    setForm((f) => ({ ...f, files: { ...f.files, [docName]: file } }))
  }

  // Validation — required fields + required docs
  const validation = useMemo(() => {
    const errors: string[] = []
    if (!form.nom.trim()) errors.push('Nom et prénom requis')
    if (!form.genre) errors.push('Genre requis')
    if (!form.dateNaissance) errors.push('Date de naissance requise')
    if (!form.niveauSouhaite) errors.push("Niveau requis")
    if (!form.contactParent.trim() || form.contactParent.trim().length < 8) {
      errors.push('Numéro de téléphone valide requis')
    }
    // Email is OPTIONAL. Only validate format when something was typed —
    // empty = no email notifications, which is a supported case.
    const emailTrimmed = form.emailParent.trim()
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      errors.push('Adresse email invalide (laisser vide si non souhaitée)')
    }
    if (hasCategories && !form.categorie) {
      errors.push('Catégorie requise')
    }
    // Required docs must have a file picked
    const missingDocs = requiredDocs
      .filter((d) => d.requis && !form.files[d.nom])
      .map((d) => d.nom)
    if (missingDocs.length > 0) {
      errors.push(`Documents obligatoires manquants : ${missingDocs.join(', ')}`)
    }
    return { valid: errors.length === 0, errors }
  }, [form, hasCategories, requiredDocs])

  async function submit() {
    if (!validation.valid || !settings) return
    setSubmitting(true)
    setError(null)
    setProgress({ label: 'Préparation des documents…', done: 0, total: 0 })

    try {
      // 1. Pre-compress all attached files (so we fail fast on oversized
      // inputs BEFORE creating the inscription doc).
      const toUpload: { nom: string; prepared: PreparedDoc }[] = []
      const fileEntries = Object.entries(form.files).filter(
        ([, file]) => file !== null
      ) as Array<[string, File]>
      setProgress({
        label: 'Compression des images…',
        done: 0,
        total: fileEntries.length,
      })

      for (let i = 0; i < fileEntries.length; i++) {
        const [nom, file] = fileEntries[i]
        const prepared = await prepareDoc(nom, file)
        toUpload.push({ nom, prepared })
        setProgress({
          label: 'Compression des images…',
          done: i + 1,
          total: fileEntries.length,
        })
      }

      // 2. Create the inscription doc
      setProgress({ label: 'Envoi du dossier…', done: 0, total: 1 })
      const trackingCode = genererTrackingCode()
      const emailTrimmed = form.emailParent.trim()
      const docRef = await addDoc(collection(db, preInscriptionsCol()), {
        nom: form.nom.trim(),
        genre: form.genre,
        date_naissance: form.dateNaissance,
        niveauSouhaite: form.niveauSouhaite,
        contactParent: form.contactParent.trim(),
        // Only include emailParent when the applicant opted in. The
        // Cloud Function that emails on status change silently skips
        // docs without this field.
        ...(emailTrimmed ? { emailParent: emailTrimmed } : {}),
        categorieDossier: form.categorie || undefined,
        dateSoumission: serverTimestamp(),
        statut: 'En attente',
        trackingCode,
      })
      setProgress({ label: 'Envoi du dossier…', done: 1, total: 1 })

      // 3. Upload each document to the subcollection
      setProgress({
        label: 'Envoi des documents…',
        done: 0,
        total: toUpload.length,
      })
      for (let i = 0; i < toUpload.length; i++) {
        await uploadPreparedDoc(docRef.id, toUpload[i].prepared)
        setProgress({
          label: 'Envoi des documents…',
          done: i + 1,
          total: toUpload.length,
        })
      }

      setSuccess({ code: trackingCode })
      setForm(EMPTY_FORM)  // clear so back-button doesn't show stale values
    } catch (err) {
      console.error('[inscription submit] error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────

  if (success) {
    return <SuccessScreen code={success.code} />
  }

  if (loadingSettings && !settings) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Physical-deposit warning */}
      <aside className="rounded-lg bg-info-bg border-l-4 border-info p-3.5">
        <p className="text-[0.82rem] font-semibold text-navy flex items-center gap-2">
          <Info className="h-4 w-4 text-info shrink-0" aria-hidden />
          Dépôt physique obligatoire
        </p>
        <p className="text-[0.78rem] text-ink-700 mt-1 leading-snug">
          La soumission en ligne est une étape préliminaire. Une fois votre
          dossier approuvé, le système vous attribuera un <strong>rendez-vous</strong>{' '}
          précis pour venir finaliser l'inscription à l'école avec vos pièces
          physiques.
        </p>
      </aside>

      {/* ── Identity section ───────────────────────────────── */}
      <FormSection icon={<User className="h-4 w-4" />} title="Identité de l'élève">
        <FieldLabel required>Nom et prénom</FieldLabel>
        <Input
          value={form.nom}
          onChange={(e) => set('nom', e.target.value)}
          placeholder="Ex : DOSSA Jean"
          autoCapitalize="words"
          maxLength={80}
        />

        <FieldLabel required>Genre</FieldLabel>
        <Select
          value={form.genre}
          onChange={(e) => set('genre', e.target.value as Genre | '')}
        >
          <option value="">Sélectionner…</option>
          <option value="M">Masculin</option>
          <option value="F">Féminin</option>
        </Select>

        <FieldLabel required>Date de naissance</FieldLabel>
        <Input
          type="date"
          value={form.dateNaissance}
          onChange={(e) => set('dateNaissance', e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
        />

        <FieldLabel required>Niveau souhaité</FieldLabel>
        <Select
          value={form.niveauSouhaite}
          onChange={(e) => set('niveauSouhaite', e.target.value)}
        >
          <option value="">Sélectionner le niveau…</option>
          {NIVEAUX.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </Select>
      </FormSection>

      {/* ── Parent contact ─────────────────────────────────── */}
      <FormSection icon={<Phone className="h-4 w-4" />} title="Contact parent">
        <FieldLabel required>Numéro de téléphone</FieldLabel>
        <Input
          type="tel"
          value={form.contactParent}
          onChange={(e) => set('contactParent', e.target.value)}
          placeholder="Ex : +229 97 00 00 00"
          inputMode="tel"
          maxLength={20}
        />
        <p className="text-[0.7rem] text-ink-500 mt-1">
          Utilisé pour les notifications WhatsApp et les rappels de rendez-vous.
        </p>

        <div className="mt-4">
          <FieldLabel>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-ink-500" aria-hidden />
              Email du parent
            </span>
            <span className="ml-1.5 text-[0.7rem] font-normal text-ink-400 normal-case tracking-normal">
              (facultatif)
            </span>
          </FieldLabel>
          <Input
            type="email"
            value={form.emailParent}
            onChange={(e) => set('emailParent', e.target.value)}
            placeholder="parent@exemple.com"
            inputMode="email"
            maxLength={120}
            autoComplete="email"
          />
          <p className="text-[0.7rem] text-ink-500 mt-1">
            Si renseigné, vous recevrez un email dès que votre dossier
            sera traité (approuvé ou refusé). Le suivi par code
            SC-XXXXXX reste disponible dans tous les cas.
          </p>
        </div>
      </FormSection>

      {/* ── Category (optional depending on school config) ─── */}
      {hasCategories && (
        <FormSection icon={<User className="h-4 w-4" />} title="Profil de l'inscription">
          <FieldLabel required>Catégorie</FieldLabel>
          <Select
            value={form.categorie}
            onChange={(e) => set('categorie', e.target.value)}
          >
            <option value="">Sélectionner votre profil…</option>
            {categories.map((c) => (
              <option key={c.nom} value={c.nom}>{c.nom}</option>
            ))}
          </Select>
          <p className="text-[0.7rem] text-ink-500 mt-1">
            Les documents demandés dépendent de votre catégorie.
          </p>
        </FormSection>
      )}

      {/* ── Documents ──────────────────────────────────────── */}
      {requiredDocs.length > 0 ? (
        <FormSection icon={<FileText className="h-4 w-4" />} title="Documents requis">
          <p className="text-[0.72rem] text-ink-500 mb-3">
            Photos ou PDF acceptés. Les images seront compressées
            automatiquement.
          </p>
          <div className="space-y-3">
            {requiredDocs.map((d) => (
              <DocInput
                key={d.nom}
                nom={d.nom}
                required={d.requis}
                file={form.files[d.nom] ?? null}
                onChange={(f) => setFile(d.nom, f)}
              />
            ))}
          </div>
        </FormSection>
      ) : hasCategories && !form.categorie ? (
        <div className="rounded-lg bg-ink-50/40 border border-ink-100 p-4 text-center text-[0.82rem] text-ink-500">
          Sélectionnez une catégorie pour voir les documents demandés.
        </div>
      ) : null}

      {/* ── Matériel notice ────────────────────────────────── */}
      {materiel.length > 0 && (
        <aside className="rounded-lg bg-gold/8 border border-gold/30 p-3.5">
          <p className="text-[0.82rem] font-bold text-navy mb-1.5">
            Matériel à apporter le jour du dépôt physique
          </p>
          <ul className="text-[0.78rem] text-ink-700 space-y-0.5 list-disc list-inside leading-snug">
            {materiel.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </aside>
      )}

      {/* ── Errors / progress / submit ─────────────────────── */}
      {error && (
        <div className="rounded-lg bg-danger-bg border border-danger/30 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden />
          <div className="text-[0.82rem] text-danger leading-snug">
            {error}
          </div>
        </div>
      )}

      {progress && (
        <div className="rounded-lg bg-info-bg border border-info/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Spinner size="sm" />
            <span className="text-[0.82rem] font-semibold text-navy">
              {progress.label}
            </span>
          </div>
          {progress.total > 0 && (
            <>
              <div className="h-1.5 rounded-full bg-info/15 overflow-hidden">
                <div
                  className="h-full bg-info transition-all"
                  style={{
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[0.7rem] text-ink-500 mt-1 text-right">
                {progress.done}/{progress.total}
              </p>
            </>
          )}
        </div>
      )}

      {!validation.valid && !submitting && (
        <div className="rounded-lg bg-warning-bg border border-warning/30 p-3">
          <p className="text-[0.78rem] font-semibold text-warning-dark mb-1">
            Complétez le formulaire pour soumettre :
          </p>
          <ul className="text-[0.75rem] text-ink-700 list-disc list-inside space-y-0.5">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <Button
        onClick={submit}
        disabled={!validation.valid || submitting}
        loading={submitting}
        leadingIcon={<CheckCircle2 className="h-4 w-4" />}
        className="w-full"
        size="lg"
      >
        Soumettre le dossier
      </Button>

      <p className="text-[0.7rem] text-ink-400 text-center px-4">
        En soumettant, vous acceptez que ces informations soient transmises
        à l'administration de l'école.
      </p>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────

function FormSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg bg-white border border-ink-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-ink-100">
        <div className="h-7 w-7 rounded-md bg-navy/8 text-navy flex items-center justify-center shrink-0">
          {icon}
        </div>
        <h3 className="font-display font-bold text-[0.95rem] text-navy">
          {title}
        </h3>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function FieldLabel({
  required,
  children,
}: {
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block text-[0.8rem] font-semibold text-ink-700 mt-1">
      {children}
      {required && <span className="text-danger ml-0.5">*</span>}
    </label>
  )
}

function DocInput({
  nom,
  required,
  file,
  onChange,
}: {
  nom: string
  required: boolean
  file: File | null
  onChange: (file: File | null) => void
}) {
  const inputId = `doc-${nom.replace(/[^a-z0-9]/gi, '-')}`

  return (
    <div className="rounded-md border border-ink-100 bg-ink-50/20 p-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
        <span className="text-[0.82rem] font-semibold text-ink-700">
          {nom}
          {required && <span className="text-danger ml-0.5">*</span>}
        </span>
        {file && (
          <Badge variant="success" size="sm">
            <CheckCircle2 className="h-3 w-3 mr-0.5 inline" />
            Sélectionné
          </Badge>
        )}
      </div>
      <label
        htmlFor={inputId}
        className={cn(
          'flex items-center gap-2 rounded-md border-2 border-dashed px-3 py-2.5 cursor-pointer transition-colors min-h-[44px]',
          file
            ? 'border-success/40 bg-success/5'
            : 'border-ink-200 bg-white hover:border-navy/30'
        )}
      >
        <Upload className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
        <span className="text-[0.78rem] text-ink-600 truncate flex-1">
          {file ? file.name : 'Choisir un fichier (image ou PDF)…'}
        </span>
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1.5 text-[0.72rem] text-ink-500 hover:text-danger underline underline-offset-2"
        >
          Retirer
        </button>
      )}
    </div>
  )
}

// ─── Success screen ───────────────────────────────────────────

function SuccessScreen({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore — user can manually note the code
    }
  }

  return (
    <div className="rounded-lg bg-white border border-success/30 shadow-sm p-6 text-center space-y-4">
      <CheckCircle2 className="h-16 w-16 text-success mx-auto" aria-hidden />
      <div>
        <h2 className="font-display text-xl font-bold text-navy">
          Dossier soumis !
        </h2>
        <p className="text-[0.85rem] text-ink-600 mt-2 leading-snug">
          Votre demande a bien été enregistrée. Conservez précieusement le
          code ci-dessous — il vous permet de suivre l'état de votre dossier
          et de reprogrammer votre rendez-vous si nécessaire.
        </p>
      </div>

      <div className="rounded-lg bg-navy/5 border-2 border-dashed border-navy/30 p-4">
        <p className="text-[0.7rem] uppercase font-bold tracking-widest text-ink-500 mb-1">
          Votre code de suivi
        </p>
        <p className="font-mono text-[1.6rem] font-bold text-navy tracking-[0.15em]">
          {code}
        </p>
      </div>

      <Button
        onClick={copy}
        variant="secondary"
        leadingIcon={<Copy className="h-4 w-4" />}
        className="w-full"
      >
        {copied ? 'Copié !' : 'Copier le code'}
      </Button>

      <div className="text-[0.75rem] text-ink-500 leading-snug pt-2 border-t border-ink-100">
        <p className="mb-1 font-semibold text-ink-700">Étapes suivantes :</p>
        <ol className="list-decimal list-inside space-y-1 text-left inline-block">
          <li>L'administration examine votre dossier</li>
          <li>Vous recevrez un rendez-vous physique par WhatsApp</li>
          <li>Venez à l'école avec les pièces originales et le paiement</li>
        </ol>
      </div>
    </div>
  )
}
