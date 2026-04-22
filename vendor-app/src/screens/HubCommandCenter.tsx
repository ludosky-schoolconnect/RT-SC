/**
 * Vendor · Screen — Hub Command Center.
 *
 * Management surface for the SchoolConnect hub (the Firebase project
 * that hosts the common landing page with the school-code gate).
 *
 * Unlike a per-school Command Center, the hub doesn't have
 * subscriptions, classes, or students. Its data is:
 *   - /cms/about  — markdown content shown on /a-propos
 *   - /school_codes/{code} — routing entries mapping school codes
 *     to per-school URLs
 *
 * This screen currently manages the À propos content. The
 * school_codes manager is a pending follow-up.
 *
 * Published docs are read by the hub's public landing + about page
 * at run time — no redeployment needed to update copy.
 */

import { useEffect, useState } from 'react'
import {
  Save,
  Info,
  FileText,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Plus,
  Trash2,
  Globe,
  Pencil,
  X,
} from 'lucide-react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import ReactMarkdown from 'react-markdown'
import { useSession } from '@/lib/session'
import { SectionCard } from '@/ui/SectionCard'
import { Button } from '@/ui/Button'
import { Textarea } from '@/ui/Textarea'
import { Input } from '@/ui/Input'

const STARTER_TEMPLATE = `# À propos de SchoolConnect

SchoolConnect est la plateforme de gestion scolaire conçue pour les
établissements secondaires du Bénin.

## Notre mission

Donner aux écoles, parents et élèves des outils simples, fiables et
accessibles partout — sur mobile comme sur ordinateur.

## Contact

Pour toute question, contactez l'administration de votre école.
`

export function HubCommandCenter() {
  const { phase } = useSession()
  if (phase.kind !== 'active') return null
  const { firebase, school } = phase

  return (
    <HubCommandCenterInner
      db={firebase.db}
      schoolName={school.name}
      projectId={firebase.projectId}
    />
  )
}

interface InnerProps {
  db: Firestore
  schoolName: string
  projectId: string
}

function HubCommandCenterInner({ db, schoolName, projectId }: InnerProps) {
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [published, setPublished] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing /cms/about on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'cms', 'about'))
        if (cancelled) return
        if (snap.exists()) {
          const data = snap.data() as {
            title?: string
            content?: string
            published?: boolean
            updatedAt?: { toDate?: () => Date }
          }
          setTitle(data.title ?? '')
          setContent(data.content ?? '')
          setPublished(data.published === true)
          if (data.updatedAt?.toDate) {
            setSavedAt(data.updatedAt.toDate())
          }
        } else {
          // First time editing — give them a starter template
          setContent(STARTER_TEMPLATE)
          setTitle('À propos de SchoolConnect')
          setPublished(false)
        }
      } catch (err) {
        console.error('[HubCommandCenter] load failed:', err)
        setError(
          "Chargement impossible. Vérifiez vos permissions Firestore sur /cms/about."
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [db])

  async function handleSave(nextPublished: boolean) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await setDoc(
        doc(db, 'cms', 'about'),
        {
          title: title.trim() || 'À propos',
          content,
          published: nextPublished,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setPublished(nextPublished)
      setSavedAt(new Date())
    } catch (err) {
      console.error('[HubCommandCenter] save failed:', err)
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-5 space-y-4">
      <div>
        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-gold-dark font-bold mb-1">
          Hub SchoolConnect
        </p>
        <h1 className="font-display text-2xl font-bold text-navy leading-tight">
          {schoolName}
        </h1>
        <p className="text-[0.82rem] text-ink-600 mt-1 leading-relaxed">
          Projet Firebase :{' '}
          <span className="font-mono text-[0.76rem] bg-ink-50 px-1.5 py-0.5 rounded border border-ink-200">
            {projectId}
          </span>
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg/50 border border-danger/30 p-3 text-[0.82rem] text-danger-dark">
          {error}
        </div>
      )}

      {/* À propos editor */}
      <SectionCard
        title="Page À propos"
        description="Contenu markdown publié sur la page publique /a-propos. Les visiteurs y accèdent depuis le pied de page de la landing."
        icon={<FileText className="h-4 w-4" aria-hidden />}
      >
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-[0.82rem] text-ink-500">
              Chargement…
            </div>
          ) : (
            <>
              {/* Status line */}
              <div className="flex items-center gap-2 flex-wrap">
                {published ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success-dark px-2.5 py-1 text-[0.72rem] font-bold">
                    <Eye className="h-3 w-3" aria-hidden />
                    Publiée
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 text-ink-600 px-2.5 py-1 text-[0.72rem] font-bold">
                    <EyeOff className="h-3 w-3" aria-hidden />
                    Brouillon
                  </span>
                )}
                {savedAt && (
                  <span className="text-[0.72rem] text-ink-500">
                    Dernière modification :{' '}
                    {savedAt.toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                )}
              </div>

              <Input
                label="Titre (facultatif)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="À propos de SchoolConnect"
                maxLength={100}
              />

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="hub-about-content"
                    className="block text-[0.78rem] font-bold text-navy"
                  >
                    Contenu (Markdown)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="text-[0.72rem] text-navy font-semibold hover:underline"
                  >
                    {showPreview ? 'Masquer' : 'Afficher'} l'aperçu
                  </button>
                </div>
                <Textarea
                  id="hub-about-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={14}
                  mono
                  placeholder={STARTER_TEMPLATE}
                />
                <p className="text-[0.7rem] text-ink-500 mt-1">
                  Utilisez Markdown : <code className="font-mono">#</code>{' '}
                  pour les titres, <code className="font-mono">**gras**</code>,{' '}
                  <code className="font-mono">- liste</code>,{' '}
                  <code className="font-mono">[texte](url)</code> pour un lien.
                </p>
              </div>

              {showPreview && (
                <div className="rounded-lg bg-off-white border border-ink-200 p-4">
                  <p className="text-[0.68rem] uppercase tracking-wider font-bold text-ink-500 mb-2">
                    Aperçu
                  </p>
                  <div className="prose prose-sm max-w-none text-ink-800">
                    <ReactMarkdown>{content || '*(vide)*'}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button
                  variant="secondary"
                  onClick={() => void handleSave(false)}
                  loading={saving}
                  disabled={saving || !content.trim()}
                  icon={<Save className="h-4 w-4" aria-hidden />}
                >
                  Enregistrer brouillon
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleSave(true)}
                  loading={saving}
                  disabled={saving || !content.trim()}
                  icon={<Eye className="h-4 w-4" aria-hidden />}
                >
                  {published ? 'Mettre à jour' : 'Publier'}
                </Button>
                {published && (
                  <a
                    href={`https://${projectId}.web.app/a-propos`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-navy hover:underline ml-auto"
                  >
                    Voir en ligne
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* School codes manager — the redirect table */}
      <SchoolCodesSection db={db} />

      {/* Info banner */}
      <div className="rounded-lg bg-info-bg/40 border border-navy/10 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
        <div className="text-[0.76rem] text-ink-700 leading-snug space-y-1">
          <p>
            Le contenu est lu par <code className="font-mono text-[0.72rem] bg-white px-1 rounded">/a-propos</code>{' '}
            sur le hub. Les modifications sont visibles immédiatement après
            publication — pas besoin de redéployer.
          </p>
          <p>
            Les permissions Firestore doivent autoriser la lecture publique
            de <code className="font-mono text-[0.72rem] bg-white px-1 rounded">/cms/about</code>{' '}
            pour que les visiteurs non-authentifiés puissent voir la page.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── School codes manager ──────────────────────────────────

interface SchoolCodeEntry {
  id: string // doc id = code (e.g. "SC-CEG-ABOMEY")
  url: string
  schoolName?: string
}

/**
 * Manages /school_codes/{code} entries on the hub Firestore.
 *
 * Each doc maps a short code (typed by the user on the landing page)
 * to a destination URL (the school's deployed RT-SC instance).
 *
 * The doc ID IS the code, so codes are unique by construction —
 * trying to add a duplicate code overwrites the existing entry,
 * which doubles as the "edit" flow.
 *
 * Codes are normalized to uppercase + alphanumerics + hyphens to
 * match what the landing page does on submit (so a doc saved here
 * matches a code typed there regardless of casing).
 */
function SchoolCodesSection({ db }: { db: Firestore }) {
  const [entries, setEntries] = useState<SchoolCodeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add/edit form state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [url, setUrl] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const snap = await getDocs(collection(db, 'school_codes'))
      const list: SchoolCodeEntry[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SchoolCodeEntry, 'id'>),
      }))
      list.sort((a, b) => a.id.localeCompare(b.id))
      setEntries(list)
    } catch (err) {
      console.error('[SchoolCodes] load failed:', err)
      setError("Lecture impossible. Vérifiez vos permissions sur /school_codes.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  function resetForm() {
    setEditingId(null)
    setCode('')
    setUrl('')
    setSchoolName('')
  }

  function startEdit(entry: SchoolCodeEntry) {
    setEditingId(entry.id)
    setCode(entry.id)
    setUrl(entry.url)
    setSchoolName(entry.schoolName ?? '')
    // Scroll the form into view on small screens — the form is above
    // the list so editing from far down the list could be confusing.
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 0)
  }

  function normalizeCode(raw: string): string {
    return raw
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 40)
  }

  async function handleSave() {
    const cleanCode = normalizeCode(code)
    const cleanUrl = url.trim()
    if (!cleanCode || !cleanUrl) {
      setError('Code et URL sont requis.')
      return
    }
    if (!/^https?:\/\//i.test(cleanUrl)) {
      setError("L'URL doit commencer par https://.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Build the doc payload. Firestore rejects `undefined` values, so we
      // build the object conditionally — `schoolName` is included only
      // when set, otherwise omitted entirely. (When merge:true, missing
      // keys leave the existing value untouched on update.)
      const payload: Record<string, unknown> = {
        url: cleanUrl,
        updatedAt: serverTimestamp(),
      }
      const trimmedName = schoolName.trim()
      if (trimmedName) {
        payload.schoolName = trimmedName
      }

      // Order matters: write the NEW doc first, then delete the old one.
      // If the write fails (permissions, validation, network), we don't
      // want the old doc gone too — that would silently delete the entry.
      await setDoc(doc(db, 'school_codes', cleanCode), payload, {
        merge: true,
      })

      // Code rename: doc IDs are immutable, so renaming = create new +
      // delete old. Only runs if write above succeeded.
      if (editingId && editingId !== cleanCode) {
        await deleteDoc(doc(db, 'school_codes', editingId))
      }

      resetForm()
      await load()
    } catch (err) {
      console.error('[SchoolCodes] save failed:', err)
      setError(
        err instanceof Error ? err.message : 'Enregistrement impossible.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry: SchoolCodeEntry) {
    if (
      !confirm(
        `Supprimer le code ${entry.id} ? Les utilisateurs qui le saisissent verront "Code introuvable".`
      )
    ) {
      return
    }
    try {
      await deleteDoc(doc(db, 'school_codes', entry.id))
      await load()
      if (editingId === entry.id) resetForm()
    } catch (err) {
      console.error('[SchoolCodes] delete failed:', err)
      alert('Suppression impossible.')
    }
  }

  return (
    <SectionCard
      title="Codes école (table de redirection)"
      description="Chaque code saisi sur la page d'accueil du hub redirige vers l'URL de l'école correspondante."
      icon={<KeyRound className="h-4 w-4" aria-hidden />}
    >
      <div className="p-4 space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-bg/50 border border-danger/30 p-3 text-[0.82rem] text-danger-dark">
            {error}
          </div>
        )}

        {/* Add / edit form */}
        <div className="rounded-lg bg-off-white border border-ink-200 p-3 space-y-3">
          <div className="flex items-center gap-2">
            {editingId ? (
              <>
                <Pencil className="h-4 w-4 text-navy" aria-hidden />
                <p className="text-[0.82rem] font-bold text-navy">
                  Modifier{' '}
                  <span className="font-mono">{editingId}</span>
                </p>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 text-navy" aria-hidden />
                <p className="text-[0.82rem] font-bold text-navy">
                  Ajouter un code
                </p>
              </>
            )}
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="ml-auto text-ink-400 hover:text-navy"
                aria-label="Annuler"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          <Input
            label="Code"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="SC-CEG-ABOMEY"
            hint="Lettres, chiffres et tirets. Tout en majuscules."
            className="font-mono"
          />
          <Input
            label="URL de l'école"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://sc-ceg-abomey.web.app"
            type="url"
          />
          <Input
            label="Nom de l'école (facultatif)"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="CEG Abomey"
            maxLength={80}
            hint="Affiché aux utilisateurs si présent."
          />

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              loading={saving}
              disabled={saving || !code.trim() || !url.trim()}
              icon={<Save className="h-4 w-4" aria-hidden />}
            >
              {editingId ? 'Mettre à jour' : 'Ajouter'}
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-8 text-center text-[0.82rem] text-ink-500">
            Chargement…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-ink-200 p-6 text-center">
            <Globe
              className="h-8 w-8 text-ink-300 mx-auto mb-2"
              aria-hidden
            />
            <p className="text-[0.82rem] text-ink-500">
              Aucun code enregistré.
            </p>
            <p className="text-[0.72rem] text-ink-400 mt-1">
              Ajoutez votre première école pour qu'elle soit accessible
              depuis la page commune.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-md bg-white border border-ink-100 px-3 py-2.5 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[0.85rem] text-navy">
                      {entry.id}
                    </span>
                    {entry.schoolName && (
                      <span className="text-[0.72rem] text-ink-500 truncate">
                        · {entry.schoolName}
                      </span>
                    )}
                  </div>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[0.72rem] font-mono text-ink-500 truncate hover:text-navy hover:underline"
                  >
                    {entry.url}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(entry)}
                  className="p-2 rounded-md text-ink-400 hover:text-navy hover:bg-ink-50 transition-colors"
                  aria-label={`Modifier ${entry.id}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(entry)}
                  className="p-2 rounded-md text-ink-400 hover:text-danger hover:bg-danger-bg/40 transition-colors"
                  aria-label={`Supprimer ${entry.id}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
