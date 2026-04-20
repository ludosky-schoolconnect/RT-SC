/**
 * RT-SC · "À propos" public page.
 *
 * Reads cms/about — a CMS-style document YOU (the developer) maintain.
 * Renders the markdown content. Falls back to a friendly placeholder when
 * the doc doesn't exist or hasn't been published yet.
 *
 * The editor for this content lives behind a UID-gated route in the admin
 * dashboard (Phase 3) — only the developer's Firebase UID can access it.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { ChevronLeft, Info } from 'lucide-react'
import { getDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { Spinner } from '@/components/ui/Spinner'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'

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
      try {
        const snap = await getDoc(docRef('cms/about'))
        return snap.exists() ? (snap.data() as AboutDoc) : null
      } catch (err) {
        // The cms collection may not be readable yet (Firestore rules not
        // deployed, or admin hasn't enabled public read). Either way, the
        // user-facing experience should match "not published yet" — no
        // misleading error message about their connection.
        const code =
          typeof err === 'object' && err && 'code' in err
            ? String((err as { code?: string }).code)
            : ''
        if (code === 'permission-denied' || code === 'failed-precondition') {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn(
              '[AboutPage] cms/about read denied — add a public-read rule. See firestore.rules.'
            )
          }
          return null
        }
        throw err
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export default function AboutPage() {
  const { data, isLoading, error } = useAboutDoc()

  const published = data?.published === true && !!data?.content?.trim()

  return (
    <div className="min-h-dvh bg-off-white">
      <div className="max-w-2xl mx-auto px-5 py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-navy/75 hover:text-navy transition-colors min-h-touch px-1"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Retour
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 opacity-90 hover:opacity-100 transition-opacity">
            <SchoolConnectLogo size={32} animate={false} />
            <span className="font-display text-sm text-navy font-semibold">SchoolConnect</span>
          </Link>
        </div>

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2">
            À propos
          </p>
          <h1 className="font-display text-3xl font-bold text-navy tracking-tight">
            {data?.title || 'SchoolConnect'}
          </h1>
        </motion.header>

        {/* Body */}
        <motion.article
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="rounded-lg border-[1.5px] border-ink-100 bg-white p-6 md:p-8"
        >
          {isLoading && (
            <div className="flex justify-center py-12">
              <Spinner size="md" label="Chargement…" />
            </div>
          )}

          {error && (
            <p className="text-center text-danger py-8">
              Impossible de charger cette page. Vérifiez votre connexion.
            </p>
          )}

          {!isLoading && !error && !published && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-info-bg text-navy">
                <Info className="h-7 w-7" aria-hidden />
              </div>
              <h2 className="font-display text-xl font-semibold text-navy mb-2">
                Page bientôt disponible
              </h2>
              <p className="text-ink-600 leading-relaxed max-w-md mx-auto">
                Cette page sera mise à jour prochainement par l'équipe SchoolConnect.
              </p>
            </div>
          )}

          {published && data?.content && (
            <div className="prose-rt-sc">
              <ReactMarkdown>{data.content}</ReactMarkdown>
            </div>
          )}
        </motion.article>

        {/* Footer */}
        <footer className="mt-6 text-center text-[0.7rem] text-ink-400 tracking-wide">
          © {new Date().getFullYear()} · SchoolConnect
        </footer>
      </div>
    </div>
  )
}
