/**
 * RT-SC · Prof Civisme tab.
 *
 * Lets a prof browse open quêtes and claim them on behalf of a
 * student in one of their classes — for the case where the student
 * doesn't have a phone or wants the prof to register their
 * commitment in person.
 *
 * Flow:
 *   1. Prof sees list of open quests (all classes they teach in)
 *   2. Tap a quest → modal opens → prof picks a class + student
 *   3. Submit → claim transaction runs → ticket modal shows
 *      → prof shows the screen / hands the printed PDF to the student
 *
 * Profs cannot validate claims themselves (admin-only). Profs cannot
 * publish or modify quests (admin-only).
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ListChecks,
  Coins,
  Users,
  Calendar,
  Hand,
  School as SchoolIcon,
  GraduationCap,
  Save,
  Info,
} from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import { elevesCol } from '@/lib/firestore-keys'
import { useAuthStore } from '@/stores/auth'
import { useClasses } from '@/hooks/useClasses'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { useAllQuetes, useClaimQuete } from '@/hooks/useQuetes'
import { useToast } from '@/stores/toast'
import { Section, SectionHeader } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { TicketCard, type TicketCardData } from '@/routes/_shared/civisme/TicketCard'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'
import type { Quete, Eleve } from '@/types/models'

export function QuetesProfTab() {
  const profil = useAuthStore((s) => s.profil)
  const { data: classes = [] } = useClasses()
  const { data: ecoleConfig } = useEcoleConfig()
  const { data: allQuetes = [], isLoading } = useAllQuetes()

  const [claimModalQuete, setClaimModalQuete] = useState<Quete | null>(null)
  const [ticketData, setTicketData] = useState<TicketCardData | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)

  // Prof can act on quests visible to ANY of their classes.
  // For each open quest with a classeIdFilter, only profs with that
  // class in classesIds see it; unrestricted ones are visible to all.
  const myClassIds = useMemo(
    () => new Set(profil?.classesIds ?? []),
    [profil?.classesIds]
  )

  const myClasses = useMemo(
    () => classes.filter((c) => myClassIds.has(c.id)),
    [classes, myClassIds]
  )

  const visibleQuetes = useMemo(() => {
    return allQuetes.filter((q) => {
      if (q.statut !== 'ouverte') return false
      if (q.slotsTaken >= q.slotsTotal) return false
      if (!q.classeIdFilter) return true
      // Filtered quest — visible only if prof teaches that class
      return myClassIds.has(q.classeIdFilter)
    })
  }, [allQuetes, myClassIds])

  if (!profil) {
    return (
      <EmptyState
        icon={<Info className="h-7 w-7" />}
        title="Session indisponible"
        description="Veuillez vous reconnecter."
      />
    )
  }

  return (
    <>
      <Section>
        <SectionHeader
          title="Quêtes du civisme"
          description="Aidez les élèves à s'inscrire à une quête. Vous recevrez un ticket à remettre à l'élève."
        />

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : visibleQuetes.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-7 w-7" />}
            title="Aucune quête disponible"
            description="L'administration publiera bientôt de nouvelles missions visibles à vos classes."
          />
        ) : (
          <div className="space-y-2">
            {visibleQuetes.map((q) => (
              <QueteCardForProf
                key={q.id}
                quete={q}
                onClaimForStudent={() => setClaimModalQuete(q)}
              />
            ))}
          </div>
        )}
      </Section>

      {claimModalQuete && (
        <ClaimOnBehalfModal
          quete={claimModalQuete}
          myClasses={myClasses}
          onClose={() => setClaimModalQuete(null)}
          onSuccess={(data) => {
            // Sequence the handoff: close the claim modal first, then
            // open the ticket modal on the NEXT tick. Without this,
            // both modals' AnimatePresence lifecycles fight in the
            // same render and React's tree blows up (blank screen).
            setClaimModalQuete(null)
            const enriched: TicketCardData = {
              ...data,
              schoolName: ecoleConfig?.nom,
            }
            setTimeout(() => {
              setTicketData(enriched)
              setTicketOpen(true)
            }, 0)
          }}
          profUid={profil.id}
          profNom={profil.nom}
        />
      )}

      <TicketCard
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        data={ticketData}
      />
    </>
  )
}

// ─── Quete card (prof variant) ──────────────────────────────

function QueteCardForProf({
  quete: q,
  onClaimForStudent,
}: {
  quete: Quete
  onClaimForStudent: () => void
}) {
  const slotsRemaining = q.slotsTotal - q.slotsTaken
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg bg-white border-[1.5px] border-ink-100 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.95rem] font-bold text-navy leading-tight">
            {q.titre}
          </p>
          {q.description && (
            <p className="text-[0.78rem] text-ink-600 mt-1 leading-snug">
              {q.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[0.72rem] flex-wrap">
            <span className="inline-flex items-center gap-1 font-bold text-success-dark">
              <Coins className="h-3 w-3" aria-hidden />
              +{q.pointsRecompense} pts
            </span>
            <span className="inline-flex items-center gap-1 text-ink-500">
              <Users className="h-3 w-3" aria-hidden />
              {slotsRemaining} libre{slotsRemaining > 1 ? 's' : ''}
            </span>
            {q.classeNomFilter && (
              <span className="inline-flex items-center gap-1 text-ink-500">
                <SchoolIcon className="h-3 w-3" aria-hidden />
                {q.classeNomFilter}
              </span>
            )}
            {q.echeance && (
              <span className="inline-flex items-center gap-1 text-ink-500">
                <Calendar className="h-3 w-3" aria-hidden />
                {q.echeance.toDate().toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onClaimForStudent}
        leadingIcon={<Hand className="h-4 w-4" aria-hidden />}
        className="w-full mt-3"
      >
        Inscrire un élève
      </Button>
    </motion.div>
  )
}

// ─── Claim-on-behalf modal ──────────────────────────────────

interface ClaimOnBehalfProps {
  quete: Quete
  myClasses: { id: string; cycle: string; niveau: string; serie: string | null; salle: string }[]
  onClose: () => void
  onSuccess: (data: TicketCardData) => void
  profUid: string
  profNom: string
}

function ClaimOnBehalfModal({
  quete,
  myClasses,
  onClose,
  onSuccess,
  profUid,
  profNom,
}: ClaimOnBehalfProps) {
  const claimMut = useClaimQuete()
  const toast = useToast()

  // If quest is class-filtered, force the class. Otherwise prof picks.
  const initialClasseId = quete.classeIdFilter ?? (myClasses[0]?.id ?? '')
  const [classeId, setClasseId] = useState(initialClasseId)
  const [eleveId, setEleveId] = useState('')
  const [eleves, setEleves] = useState<Eleve[]>([])
  const [loadingEleves, setLoadingEleves] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The quest may force a class — narrow the choices accordingly
  const availableClasses = useMemo(() => {
    if (quete.classeIdFilter) {
      return myClasses.filter((c) => c.id === quete.classeIdFilter)
    }
    return myClasses
  }, [myClasses, quete.classeIdFilter])

  // Fetch eleves for the selected class
  useEffect(() => {
    if (!classeId) {
      setEleves([])
      return
    }
    setLoadingEleves(true)
    setEleveId('')
    getDocs(collection(db, elevesCol(classeId)))
      .then((snap) => {
        const list: Eleve[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Eleve, 'id'>),
        }))
        list.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))
        setEleves(list)
      })
      .catch((err) => {
        console.error('[ClaimOnBehalfModal] eleves load failed:', err)
        toast.error('Impossible de charger les élèves.')
      })
      .finally(() => setLoadingEleves(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId])

  async function handleSubmit() {
    setError(null)
    if (!classeId) return setError('Veuillez choisir une classe.')
    if (!eleveId) return setError('Veuillez choisir un élève.')
    const eleve = eleves.find((e) => e.id === eleveId)
    if (!eleve) return setError('Élève introuvable.')
    const classe = availableClasses.find((c) => c.id === classeId)
    if (!classe) return setError('Classe introuvable.')

    // No confirm() step — the button label "Inscrire et émettre le ticket"
    // is already an explicit commitment, and stacking a confirm modal
    // on top of this modal caused a race with AnimatePresence that
    // resulted in a blank screen. The form fields above already act
    // as the "Are you sure?" moment.

    try {
      const result = await claimMut.mutateAsync({
        queteId: quete.id,
        queteTitre: quete.titre,
        pointsRecompense: quete.pointsRecompense,
        eleveId: eleve.id,
        eleveNom: eleve.nom,
        classeId,
        classeNom: nomClasse(classe as Parameters<typeof nomClasse>[0]),
        claimedBy: 'prof',
        claimedByUid: profUid,
        claimedByNom: profNom,
      })
      toast.success(`${eleve.nom} inscrit à la quête.`)
      onSuccess({
        ticketCode: result.ticketCode,
        queteTitre: quete.titre,
        eleveNom: eleve.nom,
        classeNom: nomClasse(classe as Parameters<typeof nomClasse>[0]),
        pointsRecompense: quete.pointsRecompense,
        claimedAt: new Date(),
        claimedByLabel: profNom,
        kind: 'quete',
      })
    } catch (err) {
      console.error('[ClaimOnBehalfModal] submit failed:', err)
      const msg = err instanceof Error ? err.message : 'Inscription impossible.'
      setError(msg)
    }
  }

  return (
    <Modal open={true} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>Inscrire un élève</ModalTitle>
        <ModalDescription>
          Quête : <strong className="text-navy">{quete.titre}</strong> ·{' '}
          <strong className="text-success-dark">+{quete.pointsRecompense} pts</strong>
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        {availableClasses.length > 1 && !quete.classeIdFilter && (
          <Select
            label="Classe de l'élève"
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            disabled={claimMut.isPending}
          >
            {availableClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {nomClasse(c as Parameters<typeof nomClasse>[0])}
              </option>
            ))}
          </Select>
        )}

        {availableClasses.length === 1 && (
          <div className="flex items-center gap-2 rounded-md border-[1.5px] border-ink-100 bg-ink-50/50 px-3 py-2.5 text-[0.82rem] text-ink-600">
            <SchoolIcon className="h-4 w-4 text-ink-400" aria-hidden />
            <span>
              Classe : <strong>{nomClasse(availableClasses[0] as Parameters<typeof nomClasse>[0])}</strong>
            </span>
          </div>
        )}

        {availableClasses.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg/50 px-3 py-2.5 text-[0.82rem] text-warning-dark">
            <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              Cette quête est réservée à une classe que vous n'enseignez pas.
            </span>
          </div>
        )}

        {availableClasses.length > 0 && (
          <Select
            label="Élève"
            value={eleveId}
            onChange={(e) => setEleveId(e.target.value)}
            disabled={loadingEleves || claimMut.isPending}
          >
            <option value="">
              {loadingEleves ? 'Chargement...' : '-- Choisir un élève --'}
            </option>
            {eleves.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </Select>
        )}

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-bg/60 px-3 py-2.5 text-[0.82rem] text-danger-dark">
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={claimMut.isPending}>
          Annuler
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={claimMut.isPending}
          leadingIcon={<Save className="h-4 w-4" aria-hidden />}
          disabled={availableClasses.length === 0}
        >
          Inscrire et émettre le ticket
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// suppress unused-import warnings when GraduationCap imported but not used elsewhere
void GraduationCap
