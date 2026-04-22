/**
 * RT-SC · Prof Labo Virtuel tab.
 *
 * Full tab page for teachers to browse PhET simulations and preview
 * them directly inside the app. Useful when preparing lessons —
 * teachers can sample different sims without leaving SchoolConnect,
 * then share URLs via Annonces or discuss them in class.
 *
 * Purely client-side: no Firestore reads, no backend.
 */

import { motion } from 'framer-motion'
import { FlaskConical } from 'lucide-react'
import { LaboBrowser } from '@/routes/_shared/labo/LaboBrowser'

export function LaboProfTab() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4"
    >
      <header className="mb-2">
        <h2 className="font-display text-2xl font-bold text-navy leading-tight flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-emerald-600" aria-hidden />
          Laboratoire virtuel
        </h2>
        <p className="text-[0.82rem] text-ink-600 mt-0.5">
          Simulations interactives PhET pour illustrer vos cours.
        </p>
      </header>

      <LaboBrowser />
    </motion.div>
  )
}
