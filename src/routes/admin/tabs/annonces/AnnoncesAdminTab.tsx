/**
 * RT-SC · Admin → Annonces tab.
 *
 * Admin's central composer + full list of every annonce. Uses the
 * shared AnnonceRow + ModalAnnonceDetail for the display layer; only
 * the admin-specific pieces (composer, create button) live here.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, Plus } from 'lucide-react'

import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useAllAnnonces } from '@/hooks/useAnnonces'
import type { Annonce } from '@/types/models'

import { ModalComposeAnnonce } from './ModalComposeAnnonce'
import { AnnonceRow } from '@/routes/_shared/annonces/AnnonceRow'
import { ModalAnnonceDetail } from '@/routes/_shared/annonces/ModalAnnonceDetail'

export function AnnoncesAdminTab() {
  const { data: annonces = [], isLoading } = useAllAnnonces()
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Annonce | null>(null)
  const [selected, setSelected] = useState<Annonce | null>(null)

  function openEdit(annonce: Annonce) {
    setSelected(null)         // close detail
    setEditing(annonce)       // set edit target
    setComposeOpen(true)      // open composer in edit mode
  }

  function closeCompose() {
    setComposeOpen(false)
    setEditing(null)
  }

  return (
    <Section>
      <SectionHeader
        kicker="Communication"
        title="Annonces"
        description={
          annonces.length === 0
            ? 'Aucune annonce publiée pour le moment.'
            : `${annonces.length} annonce${annonces.length > 1 ? 's' : ''} publiée${annonces.length > 1 ? 's' : ''}.`
        }
        action={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null)
              setComposeOpen(true)
            }}
          >
            Nouvelle annonce
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : annonces.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="Aucune annonce"
          description="Créez votre première annonce pour communiquer avec les familles et les équipes."
        />
      ) : (
        <div className="space-y-2">
          {annonces.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: Math.min(i * 0.03, 0.25) },
              }}
            >
              <AnnonceRow annonce={a} onOpen={() => setSelected(a)} />
            </motion.div>
          ))}
        </div>
      )}

      <ModalComposeAnnonce
        open={composeOpen}
        onClose={closeCompose}
        editAnnonce={editing ?? undefined}
      />

      {selected && (
        <ModalAnnonceDetail
          open={!!selected}
          onClose={() => setSelected(null)}
          annonce={selected}
          onRequestEdit={() => openEdit(selected)}
        />
      )}
    </Section>
  )
}
