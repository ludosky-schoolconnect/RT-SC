/**
 * RT-SC · Modal de déclaration d'absence (élève / parent).
 *
 * Single shared modal used by both élève and parent. The `mode` prop
 * controls copy framing:
 *
 *   - 'eleve'  → "Déclarer mon absence" / "Je serai absent…"
 *   - 'parent' → "Déclarer une absence pour {firstName}"
 *
 * Validation:
 *   - Date must be today or future (no back-dating)
 *   - Time range required (heure début < heure fin)
 *   - Raison required (min 10 chars to discourage one-word declarations)
 *   - Quota check via checkQuota() against existing absences cache
 *
 * Server-side time-window enforcement (06h-18h Bénin) lives in Firestore
 * Rules; this client check is UX only. If the rules block the write,
 * we surface a friendly fallback message.
 */

import { useState, useEffect, useMemo } from 'react'
import { Calendar, AlertCircle, Send } from 'lucide-react'

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

import {
  useDeclareAbsence,
  checkQuota,
  checkOngoingClass,
  hasVerrouToday,
  type OngoingClass,
} from '@/hooks/useEleveAbsencesMutations'
import { useEleveAbsences } from '@/hooks/useEleveAbsences'
import { useToast } from '@/stores/toast'

interface Props {
  open: boolean
  onClose: () => void
  classeId: string
  classeNom: string
  eleveId: string
  eleveName: string
  /** UID of the declarant (élève session UID or parent session UID). */
  declaredByUid: string
  /** Framing of the copy. */
  mode: 'eleve' | 'parent'
}

const MIN_RAISON = 10

function todayDateInputValue(): string {
  // YYYY-MM-DD in local time for <input type="date" min={...}>
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function ModalDeclareAbsence({
  open,
  onClose,
  classeId,
  classeNom,
  eleveId,
  eleveName,
  declaredByUid,
  mode,
}: Props) {
  const { data: existing = [] } = useEleveAbsences(classeId, eleveId)
  const declareMut = useDeclareAbsence()
  const toast = useToast()

  const today = useMemo(() => todayDateInputValue(), [])

  const [date, setDate] = useState(today)
  const [heureDebut, setHeureDebut] = useState('08:00')
  const [heureFin, setHeureFin] = useState('17:00')
  const [raison, setRaison] = useState('')

  const [dateErr, setDateErr] = useState<string | null>(null)
  const [heureErr, setHeureErr] = useState<string | null>(null)
  const [raisonErr, setRaisonErr] = useState<string | null>(null)
  const [submitErr, setSubmitErr] = useState<string | null>(null)

  // Server-side locks: verrouToday (prof marked absent via appel) +
  // ongoing class (emploi du temps says élève is supposed to be in
  // class right now). Both are refreshed while the modal is open:
  // verrouToday on every open (cheap: one getDoc); ongoing-class every
  // 60s so the form unlocks itself when class ends.
  const [verrouToday, setVerrouToday] = useState<boolean | null>(null)
  const [ongoing, setOngoing] = useState<OngoingClass | null>(null)

  // verrou check — runs once per open
  useEffect(() => {
    if (!open || !classeId || !eleveId) return
    let cancelled = false
    hasVerrouToday(classeId, eleveId)
      .then((v) => {
        if (!cancelled) setVerrouToday(v)
      })
      .catch(() => {
        if (!cancelled) setVerrouToday(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, classeId, eleveId])

  // ongoing-class check — runs every 60s while modal is open
  useEffect(() => {
    if (!open || !classeId) return
    let cancelled = false
    async function tick() {
      const res = await checkOngoingClass(classeId)
      if (!cancelled) setOngoing(res)
    }
    tick()
    const interval = setInterval(tick, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [open, classeId])

  // Reset whenever the modal re-opens
  useEffect(() => {
    if (!open) return
    setDate(today)
    setHeureDebut('08:00')
    setHeureFin('17:00')
    setRaison('')
    setDateErr(null)
    setHeureErr(null)
    setRaisonErr(null)
    setSubmitErr(null)
  }, [open, today])

  const firstName = (eleveName.split(/\s+/)[0] ?? eleveName).trim()
  const titleText =
    mode === 'parent' ? `Déclarer une absence pour ${firstName}` : 'Déclarer mon absence'
  const descText =
    mode === 'parent'
      ? "Cette déclaration sera transmise à l'établissement et apparaîtra dans le suivi."
      : "Ta déclaration sera transmise à l'établissement. Pense à apporter un justificatif à ton retour."
  const subjectFor = mode === 'parent' ? `${firstName} sera absent(e)` : 'Je serai absent(e)'

  function validate(): { ok: boolean; payloadDate?: Date } {
    let ok = true
    setDateErr(null)
    setHeureErr(null)
    setRaisonErr(null)

    // Date
    if (!date) {
      setDateErr('Date requise.')
      ok = false
    } else if (date < today) {
      setDateErr("Vous ne pouvez pas justifier une absence passée.")
      ok = false
    }

    // Time range
    if (!heureDebut || !heureFin) {
      setHeureErr('Heures requises.')
      ok = false
    } else if (heureDebut >= heureFin) {
      setHeureErr("L'heure de début doit être avant l'heure de fin.")
      ok = false
    }

    // Raison
    const r = raison.trim()
    if (r.length < MIN_RAISON) {
      setRaisonErr(`La raison doit contenir au moins ${MIN_RAISON} caractères.`)
      ok = false
    }

    if (!ok) return { ok: false }
    return { ok: true, payloadDate: new Date(date + 'T12:00:00') }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitErr(null)
    const { ok, payloadDate } = validate()
    if (!ok || !payloadDate) return

    // Verrou check — prof already marked absent today
    if (verrouToday) {
      setSubmitErr(
        "Un professeur vous a marqué absent(e) aujourd'hui. La déclaration en ligne est bloquée."
      )
      return
    }

    // Ongoing-class check — can't declare during class hours
    if (ongoing) {
      setSubmitErr(
        `Un cours est en cours (${ongoing.matiere}) jusqu'à ${ongoing.heureFin}. Vous pourrez déclarer après.`
      )
      return
    }

    // Quota check (counts by createdAt, not by target date)
    const quotaErr = checkQuota(existing, payloadDate)
    if (quotaErr) {
      setSubmitErr(quotaErr)
      return
    }

    try {
      await declareMut.mutateAsync({
        classeId,
        classeNom,
        eleveId,
        eleveNom: eleveName,
        date: payloadDate,
        heureDebut,
        heureFin,
        raison: raison.trim(),
        source: mode,
        declaredByUid,
      })
      toast.success(
        mode === 'parent'
          ? 'Absence déclarée pour votre enfant.'
          : 'Absence déclarée.'
      )
      onClose()
    } catch (err: unknown) {
      console.error('[ModalDeclareAbsence] error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('PERMISSION_DENIED') || msg.includes('insufficient')) {
        setSubmitErr(
          "Action refusée par les règles de sécurité. Contactez l'école si vous pensez qu'il s'agit d'une erreur."
        )
      } else {
        setSubmitErr(
          "Échec de l'envoi. Vérifiez votre connexion et réessayez."
        )
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning/30">
            <Calendar className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <ModalTitle>{titleText}</ModalTitle>
            <ModalDescription>{descText}</ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ModalBody className="space-y-4">
          {/* Lock banner — visible whenever a server-side guard is active.
              Priority: verrou > ongoing class. These override user input;
              showing the reason upfront is clearer than blocking on submit. */}
          {verrouToday && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-bg/50 px-3 py-3 text-[0.85rem] text-ink-800"
            >
              <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden />
              <div className="leading-snug">
                <p className="font-semibold text-danger">
                  Déclaration bloquée pour aujourd'hui
                </p>
                <p className="text-[0.8rem] mt-0.5">
                  Un professeur vous a marqué absent(e) aujourd'hui lors de
                  l'appel. Pour toute justification, présentez-vous à la
                  direction.
                </p>
              </div>
            </div>
          )}

          {!verrouToday && ongoing && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-3 text-[0.85rem] text-ink-800"
            >
              <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
              <div className="leading-snug">
                <p className="font-semibold text-warning-dark">
                  Cours en cours — déclaration indisponible
                </p>
                <p className="text-[0.8rem] mt-0.5">
                  {ongoing.matiere} est en cours jusqu'à{' '}
                  <strong>{ongoing.heureFin}</strong>. La déclaration
                  redeviendra disponible automatiquement après la fin du cours.
                </p>
              </div>
            </div>
          )}

          <Input
            type="date"
            label="Date d'absence"
            value={date}
            min={today}
            onChange={(e) => {
              setDate(e.target.value)
              setDateErr(null)
            }}
            error={dateErr ?? undefined}
            hint={!dateErr ? subjectFor : undefined}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="time"
              label="Heure de début"
              value={heureDebut}
              onChange={(e) => {
                setHeureDebut(e.target.value)
                setHeureErr(null)
              }}
              error={heureErr ?? undefined}
            />
            <Input
              type="time"
              label="Heure de fin"
              value={heureFin}
              onChange={(e) => {
                setHeureFin(e.target.value)
                setHeureErr(null)
              }}
            />
          </div>

          <Textarea
            label="Raison de l'absence"
            value={raison}
            onChange={(e) => {
              setRaison(e.target.value)
              setRaisonErr(null)
            }}
            placeholder={
              mode === 'parent'
                ? 'Ex. Rendez-vous médical, événement familial…'
                : 'Ex. Rendez-vous médical, examen externe…'
            }
            rows={3}
            error={raisonErr ?? undefined}
            hint={
              !raisonErr
                ? `${raison.trim().length}/${MIN_RAISON} caractères minimum`
                : undefined
            }
          />

          {submitErr && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg/40 px-3 py-2.5 text-[0.82rem] text-ink-800"
            >
              <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden />
              <div>{submitErr}</div>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={declareMut.isPending}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={declareMut.isPending}
            disabled={!!verrouToday || !!ongoing || declareMut.isPending}
            leadingIcon={<Send className="h-4 w-4" />}
          >
            Déclarer
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
