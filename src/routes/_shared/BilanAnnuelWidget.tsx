/**
 * RT-SC · BilanAnnuelWidget — Accueil widget for the annual bulletin.
 *
 * Shown on the élève + parent home screens once the PP has closed
 * the year (the annual bulletin doc exists at `/bulletins/Année`).
 * Surfaces the two things that matter most at end-of-year:
 *
 *   - Moyenne annuelle (sur 20)
 *   - Statut : "Admis" or "Échoué"
 *
 * Tapping opens the full annual bulletin in ModalBulletinDetail
 * (shared with BulletinsTab — same view, same download button).
 *
 * Visibility gate: renders nothing until `data.annual` exists. No
 * placeholder, no skeleton, no "En attente" — we don't want to
 * clutter the home with aspirational copy. When the PP closes the
 * year, the widget appears automatically on the next fetch.
 *
 * Reuses:
 *   - useEleveBulletinList (already cached 5 min per student)
 *   - FeaturedBulletinCard with mode='annuelle' (gold styling when
 *     passing, adapts for Échoué)
 *   - ModalBulletinDetail (full bulletin view + PDF download)
 */

import { useState } from 'react'
import { useEleveBulletinList } from '@/hooks/useEleveBulletinList'
import { FeaturedBulletinCard } from '@/routes/_shared/accueilPrimitives'
import { ModalBulletinDetail } from '@/routes/_shared/bulletins/ModalBulletinDetail'

interface Props {
  classeId: string
  eleveId: string
  eleveName: string
}

export function BilanAnnuelWidget({ classeId, eleveId, eleveName }: Props) {
  const { data, isLoading } = useEleveBulletinList({ classeId, eleveId })
  const [open, setOpen] = useState(false)

  // Loading: render nothing — the widget is a "surprise appearance"
  // at year-end, not a persistent slot. Showing a skeleton would
  // falsely suggest a bulletin is about to appear.
  if (isLoading) return null

  // No annual bulletin → no widget. This is the DEFAULT state for
  // 95% of the school year.
  if (!data?.annual) return null

  return (
    <>
      <FeaturedBulletinCard
        summary={data.annual}
        mode="annuelle"
        onOpen={() => setOpen(true)}
        genre={data.genre}
      />
      <ModalBulletinDetail
        open={open}
        onClose={() => setOpen(false)}
        mode="annuelle"
        classeId={classeId}
        eleveId={eleveId}
        eleveName={eleveName}
      />
    </>
  )
}
