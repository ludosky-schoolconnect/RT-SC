/**
 * RT-SC · Visio tab — prof + admin shared surface.
 *
 * Host-side UI for ad-hoc video meetings with parents. Matches the
 * legacy SchoolConnect flow:
 *
 *   1. Host picks a classe (from the classes they have access to)
 *   2. Host sees a list of eleves in that classe
 *   3. Host taps "Démarrer la visio" on an eleve row
 *   4. A Jitsi room opens in a full-screen overlay
 *   5. The parent of that eleve can join the same room from their
 *      Accueil widget (same deterministic room name)
 *
 * No scheduling: the host and parent coordinate timing out-of-band
 * (phone call, WhatsApp). The room stays open as long as at least
 * one participant is connected.
 *
 * Usage:
 *   Prof side: pass `scope='prof'` — hook filters to the prof's
 *              teaching classes.
 *   Admin side: pass `scope='admin'` — all classes.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  MonitorPlay,
  Video,
  Users,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useClasses } from '@/hooks/useClasses'
import { useAllEleves } from '@/hooks/useAllEleves'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useAuthStore } from '@/stores/auth'
import { VisioOverlay, buildRoomName } from '@/routes/_shared/visio/VisioOverlay'
import type { Classe } from '@/types/models'

type ElevePlusClasse = {
  id: string
  nom: string
  genre?: string
  classeId: string
}

interface Props {
  scope: 'admin' | 'prof'
}

export function VisioHostTab({ scope }: Props) {
  const { data: config } = useEcoleConfig()
  const { data: allClasses = [], isLoading: classesLoading } = useClasses()
  const { data: allEleves = [], isLoading: elevesLoading } = useAllEleves()
  const profil = useAuthStore((s) => s.profil)
  const user = useAuthStore((s) => s.user)

  const [classeId, setClasseId] = useState<string>('')
  const [activeRoom, setActiveRoom] = useState<{
    roomName: string
    userName: string
    subject: string
  } | null>(null)

  // Filter classes based on scope
  const classes = useMemo(() => {
    if (scope === 'admin') return allClasses
    const mine = new Set(profil?.classesIds ?? [])
    return allClasses.filter((c) => mine.has(c.id))
  }, [allClasses, profil?.classesIds, scope])

  // Eleves of the selected classe
  const eleves = useMemo(() => {
    if (!classeId) return []
    return allEleves
      .filter((e) => e.classeId === classeId)
      .sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'fr'))
  }, [allEleves, classeId])

  const hostName = useMemo(() => {
    if (scope === 'admin') return "Administration"
    return profil?.nom ?? user?.displayName ?? 'Professeur'
  }, [scope, profil?.nom, user?.displayName])

  const ecoleId = config?.nom ? config.nom : 'ecole'

  function startVisio(eleve: ElevePlusClasse) {
    const roomName = buildRoomName(ecoleId, eleve.id)
    setActiveRoom({
      roomName,
      userName: `[HÔTE] ${hostName}`,
      subject: `Rendez-vous pédagogique · ${eleve.nom}`,
    })
  }

  if (classesLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="px-4 sm:px-6 max-w-3xl mx-auto pt-4 pb-12 space-y-4"
    >
      <header className="mb-2">
        <h2 className="font-display text-2xl font-bold text-navy leading-tight flex items-center gap-2">
          <MonitorPlay className="h-6 w-6 text-info" aria-hidden />
          Visio
        </h2>
        <p className="text-[0.82rem] text-ink-600 mt-0.5">
          Rendez-vous vidéo avec les parents. Sélectionnez une classe,
          puis lancez la visio pour un élève.
        </p>
      </header>

      {/* Info banner: host must open first */}
      <div className="rounded-lg bg-info-bg/40 border border-navy/10 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
        <div className="text-[0.78rem] text-ink-700 leading-relaxed">
          <p>
            <strong className="text-navy">Vous êtes l'hôte.</strong>{' '}
            Ouvrez la salle en premier, puis prévenez le parent (appel
            ou WhatsApp) qu'il peut rejoindre depuis son espace.
          </p>
        </div>
      </div>

      {/* Classe selector */}
      <div className="rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] p-4">
        <label
          htmlFor="visio-classe"
          className="block text-[0.78rem] font-bold text-navy mb-1.5"
        >
          Classe
        </label>
        <Select
          id="visio-classe"
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          className="w-full"
        >
          <option value="">— Sélectionner une classe —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classeLabel(c)}
            </option>
          ))}
        </Select>
      </div>

      {/* Eleves list */}
      {!classeId ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Aucune classe sélectionnée"
          description="Choisissez une classe pour afficher la liste des élèves."
        />
      ) : elevesLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : eleves.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Classe vide"
          description="Aucun élève inscrit dans cette classe."
        />
      ) : (
        <ul className="space-y-2">
          {eleves.map((eleve, i) => (
            <motion.li
              key={eleve.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015, duration: 0.18 }}
            >
              <EleveRow
                eleve={eleve}
                onStart={() => startVisio(eleve)}
              />
            </motion.li>
          ))}
        </ul>
      )}

      {/* The overlay */}
      <VisioOverlay
        open={!!activeRoom}
        onClose={() => setActiveRoom(null)}
        roomName={activeRoom?.roomName ?? ''}
        userName={activeRoom?.userName ?? ''}
        subject={activeRoom?.subject ?? ''}
      />
    </motion.div>
  )
}

// ─── Row component ──────────────────────────────────────────

function EleveRow({
  eleve,
  onStart,
}: {
  eleve: ElevePlusClasse
  onStart: () => void
}) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-display text-[0.92rem] font-bold text-navy leading-tight truncate">
          {eleve.nom}
        </p>
        <p className="text-[0.72rem] text-ink-500 mt-0.5">
          {eleve.genre === 'F' ? 'Élève · F' : 'Élève · M'}
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onStart}
        leadingIcon={<Video className="h-4 w-4" aria-hidden />}
      >
        Démarrer
      </Button>
      <ChevronRight className="h-4 w-4 text-ink-300" aria-hidden />
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function classeLabel(c: Classe): string {
  const serie = c.serie ? ` ${c.serie}` : ''
  return `${c.niveau}${serie} ${c.salle}`
}
