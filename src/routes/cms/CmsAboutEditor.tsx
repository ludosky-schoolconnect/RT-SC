/**
 * RT-SC · À propos CMS editor.
 *
 * Hidden route at /__cms/about. Wrapped in <UidGate> so only the developer
 * (matching VITE_OWNER_UID) can see it.
 *
 * Layout:
 *   - Header bar with status badge (Brouillon / Publié) + Save + Last updated
 *   - Two-column on desktop: editor left, live preview right
 *   - Single-column tabs on mobile (Édition / Aperçu)
 *
 * Reads/writes /cms/about. The public /a-propos page reads the same doc.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft,
  Eye,
  FileEdit,
  Save,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'

import { docRef } from '@/firebase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/cn'

interface AboutDoc {
  title?: string
  content?: string
  published?: boolean
  updatedAt?: { toDate: () => Date }
}

function useAboutDoc() {
  return useQuery<AboutDoc | null>({
    queryKey: ['cms', 'about'],
    queryFn: async () => {
      const snap = await getDoc(docRef('cms/about'))
      return snap.exists() ? (snap.data() as AboutDoc) : null
    },
    staleTime: 30_000,
  })
}

interface SavePayload {
  title: string
  content: string
  published: boolean
}

function useSaveAbout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SavePayload) => {
      await setDoc(docRef('cms/about'), {
        ...payload,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms', 'about'] })
    },
  })
}

const STARTER_TEMPLATE = `# À propos de SchoolConnect

SchoolConnect est une plateforme scolaire numérique conçue pour les
établissements du secondaire au Bénin.

## Notre mission

Simplifier la gestion des classes, des élèves et des bulletins, tout en
gardant les enseignants et les parents au cœur du dispositif.

## Contact

Pour toute question : **schoolconnect@example.bj**
`

export default function CmsAboutEditor() {
  const toast = useToast()
  const { data, isLoading } = useAboutDoc()
  const saveMut = useSaveAbout()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [published, setPublished] = useState(false)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')

  // Hydrate when the Firestore data arrives
  useEffect(() => {
    if (data) {
      setTitle(data.title ?? '')
      setContent(data.content ?? '')
      setPublished(data.published === true)
    }
  }, [data])

  const isDirty = useMemo(() => {
    if (!data) {
      // No doc yet — dirty if user has typed anything
      return title.trim() !== '' || content.trim() !== '' || published
    }
    return (
      title !== (data.title ?? '') ||
      content !== (data.content ?? '') ||
      published !== (data.published === true)
    )
  }, [data, title, content, published])

  const lastUpdated = useMemo(() => {
    if (!data?.updatedAt) return null
    try {
      const d = data.updatedAt.toDate()
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Porto-Novo',
      }).format(d)
    } catch {
      return null
    }
  }, [data])

  async function save() {
    try {
      await saveMut.mutateAsync({
        title: title.trim(),
        content,
        published,
      })
      toast.success(
        published
          ? 'Modifications publiées sur /a-propos.'
          : 'Brouillon enregistré.'
      )
    } catch (err) {
      console.error('[CmsAboutEditor] save error:', err)
      toast.error("Échec de l'enregistrement.")
    }
  }

  function loadStarter() {
    if (content.trim() && !confirm('Remplacer le contenu actuel par le modèle de démarrage ?')) {
      return
    }
    setContent(STARTER_TEMPLATE)
    if (!title.trim()) setTitle('SchoolConnect')
  }

  return (
    <div className="min-h-dvh bg-off-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-navy text-white">
        <div className="max-w-6xl mx-auto px-4 h-[68px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-colors h-9 w-9"
              aria-label="Retour"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
            <div className="min-w-0">
              <p className="text-[0.65rem] uppercase tracking-[0.15em] text-white/45 leading-none flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-gold-light" aria-hidden />
                CMS · Accès propriétaire
              </p>
              <p className="font-display text-[0.95rem] font-semibold leading-tight mt-0.5 truncate">
                Édition de la page À propos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant={published ? 'success' : 'neutral'}
              size="sm"
              className="hidden sm:inline-flex"
            >
              {published ? 'Publié' : 'Brouillon'}
            </Badge>
            <a
              href="/a-propos"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 rounded-md text-[0.78rem] text-white/70 hover:text-white px-2 py-1.5"
            >
              Voir <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            <Button
              size="sm"
              onClick={save}
              disabled={!isDirty}
              loading={saveMut.isPending}
              leadingIcon={<Save className="h-4 w-4" />}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" label="Chargement…" />
        </div>
      ) : (
        <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 space-y-4">
          {/* Title + status row */}
          <div className="rounded-lg border-[1.5px] border-ink-100 bg-white p-4 space-y-3">
            <Input
              label="Titre de la page"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="SchoolConnect"
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="h-4 w-4 accent-success"
                />
                <span className="text-[0.875rem] font-semibold text-ink-800">
                  Publier sur /a-propos
                </span>
                <span className="text-[0.78rem] text-ink-400">
                  ({published ? 'visible publiquement' : 'masquée'})
                </span>
              </label>
              {lastUpdated && (
                <p className="text-[0.78rem] text-ink-400">
                  Dernière modification : {lastUpdated}
                </p>
              )}
            </div>
          </div>

          {/* Mobile tab switcher */}
          <div className="md:hidden flex items-center gap-1 rounded-md bg-white border border-ink-100 p-1">
            <TabBtn
              active={mobileView === 'edit'}
              onClick={() => setMobileView('edit')}
              icon={<FileEdit className="h-4 w-4" />}
              label="Édition"
            />
            <TabBtn
              active={mobileView === 'preview'}
              onClick={() => setMobileView('preview')}
              icon={<Eye className="h-4 w-4" />}
              label="Aperçu"
            />
          </div>

          {/* Editor + preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Editor */}
            <section
              className={cn(
                'rounded-lg border-[1.5px] border-ink-100 bg-white overflow-hidden',
                mobileView === 'preview' && 'hidden md:block'
              )}
            >
              <div className="flex items-center justify-between px-4 py-2 bg-ink-50/50 border-b border-ink-100">
                <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 inline-flex items-center gap-1.5">
                  <FileEdit className="h-3 w-3" aria-hidden />
                  Édition Markdown
                </p>
                {!content.trim() && (
                  <button
                    type="button"
                    onClick={loadStarter}
                    className="text-[0.78rem] text-navy font-semibold hover:underline"
                  >
                    Charger un modèle
                  </button>
                )}
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# Titre

Votre contenu en **Markdown**."
                spellCheck
                className="w-full p-4 font-mono text-[0.875rem] leading-relaxed text-ink-800 bg-white border-0 outline-none resize-y min-h-[400px]"
              />
            </section>

            {/* Preview */}
            <section
              className={cn(
                'rounded-lg border-[1.5px] border-ink-100 bg-white overflow-hidden',
                mobileView === 'edit' && 'hidden md:block'
              )}
            >
              <div className="flex items-center px-4 py-2 bg-ink-50/50 border-b border-ink-100">
                <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 inline-flex items-center gap-1.5">
                  <Eye className="h-3 w-3" aria-hidden />
                  Aperçu — comme sur /a-propos
                </p>
              </div>
              <div className="p-6 min-h-[400px]">
                {content.trim() ? (
                  <article className="prose-rt-sc">
                    {title && <h1>{title}</h1>}
                    <ReactMarkdown>{content}</ReactMarkdown>
                  </article>
                ) : (
                  <p className="text-ink-400 italic">
                    L'aperçu apparaîtra ici dès que vous écrirez du contenu.
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Help */}
          <div className="rounded-md bg-info-bg border border-navy/15 px-4 py-3 text-[0.8125rem] text-navy">
            <p className="font-semibold mb-1">Aide Markdown rapide</p>
            <p className="text-navy/80 leading-relaxed">
              <code className="font-mono">## Titre</code> · {' '}
              <code className="font-mono">**gras**</code> · {' '}
              <code className="font-mono">*italique*</code> · {' '}
              <code className="font-mono">- liste</code> · {' '}
              <code className="font-mono">[texte](url)</code>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

interface TabBtnProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function TabBtn({ active, onClick, icon, label }: TabBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 inline-flex items-center justify-center gap-1.5 rounded px-3 py-2 text-[0.8125rem] font-semibold transition-colors',
        active ? 'bg-navy text-white' : 'text-ink-400 hover:text-navy'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
