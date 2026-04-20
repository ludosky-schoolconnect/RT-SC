/**
 * RT-SC · Danger zone card (Année).
 *
 * Wires the two rollover operations:
 *   1. Transition élèves (per class) — multi-step wizard
 *   2. Archive année (school-wide) — type-to-confirm + multi-step exec
 *
 * Both are destructive; both have their own confirm flows in their modals.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, Archive, Users, ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ModalTransitionEleves } from './ModalTransitionEleves'
import { ModalArchiveAnnee } from './ModalArchiveAnnee'

export function DangerZoneCard() {
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15 }}
    >
      <Card className="border-danger/25 bg-danger-bg/30" accent={false}>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-danger">
              <ShieldAlert className="h-5 w-5" aria-hidden />
              Zone dangereuse
            </CardTitle>
            <CardDescription>
              Actions de fin d'année — irréversibles et destructrices.
              Procédez dans l'ordre : transition d'abord, puis archivage.
            </CardDescription>
          </div>
        </CardHeader>

        <div className="space-y-3">
          <DangerRow
            icon={<Users className="h-4 w-4" />}
            title="1. Transition des élèves"
            description="Promouvoir les admis vers la classe supérieure et maintenir les échoués. À répéter pour chaque classe."
            onClick={() => setTransitionOpen(true)}
          />
          <DangerRow
            icon={<Archive className="h-4 w-4" />}
            title="2. Archiver l'année"
            description="Copier toutes les données dans /archive/{annee}, réinitialiser les classes et démarrer la nouvelle année."
            onClick={() => setArchiveOpen(true)}
          />
        </div>
      </Card>

      <ModalTransitionEleves
        open={transitionOpen}
        onClose={() => setTransitionOpen(false)}
      />
      <ModalArchiveAnnee
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      />
    </motion.div>
  )
}

interface DangerRowProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}

function DangerRow({ icon, title, description, onClick }: DangerRowProps) {
  return (
    <div className="rounded-md bg-white border border-danger/20 p-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-danger-bg text-danger">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[0.875rem] font-semibold text-navy">{title}</p>
          <p className="text-[0.78rem] text-ink-600 mt-0.5 leading-snug">
            {description}
          </p>
        </div>
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={onClick}
        className="shrink-0"
        trailingIcon={<ArrowRight className="h-3.5 w-3.5" />}
      >
        Lancer
      </Button>
    </div>
  )
}
