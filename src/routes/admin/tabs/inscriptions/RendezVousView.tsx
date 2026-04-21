/**
 * RT-SC · Rendez-vous view — approved dossiers grouped by visit date.
 *
 * Each card represents a future RV date. Cards expand to show all
 * dossiers scheduled for that day. Per-row:
 *   - Élève + niveau + class assigned
 *   - WhatsApp pre-filled message (parent reminder)
 *   - Phone link
 *   - Reprogrammer button (admin-side override — uses same RV
 *     algorithm, decrements old day's slot, takes new)
 *   - Counts of attempts left (3 - reprogCount)
 *
 * Past dates (RV date < today) appear in a separate collapsed
 * "Rendez-vous passés" section so admin can spot no-shows.
 */

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Phone,
  RotateCw,
  School as SchoolIcon,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useClasses } from '@/hooks/useClasses'
import {
  useReprogrammerRV,
  useDeleteInscription,
} from '@/hooks/usePreInscriptions'
import { useSettingsInscription } from '@/hooks/useSettingsInscription'
import {
  DEFAULT_PLACES_PAR_JOUR,
  parseDDMMYYYY,
  REPROG_MAX,
} from '@/lib/inscription-rdv'
import { nomClasse } from '@/lib/benin'
import { cn } from '@/lib/cn'
import type { Classe, PreInscription } from '@/types/models'

interface Props {
  list: PreInscription[]
}

export function RendezVousView({ list }: Props) {
  const { data: classes = [] } = useClasses()
  const classeById = useMemo(() => {
    const m = new Map<string, Classe>()
    for (const c of classes) m.set(c.id, c)
    return m
  }, [classes])

  // Group by dateRV
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  const grouped = useMemo(() => {
    const upcoming = new Map<string, PreInscription[]>()
    const past = new Map<string, PreInscription[]>()

    const approved = list.filter(
      (d) => d.statut === 'Approuvé' && d.dateRV
    )

    for (const d of approved) {
      const date = parseDDMMYYYY(d.dateRV ?? '')
      if (!date) continue
      const key = d.dateRV!
      const target = date.getTime() < today.getTime() ? past : upcoming
      if (!target.has(key)) target.set(key, [])
      target.get(key)!.push(d)
    }

    function toSorted(m: Map<string, PreInscription[]>): Array<{
      key: string
      date: Date
      items: PreInscription[]
    }> {
      return Array.from(m.entries())
        .map(([key, items]) => ({
          key,
          date: parseDDMMYYYY(key) ?? new Date(0),
          items,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    return {
      upcoming: toSorted(upcoming),
      past: toSorted(past),
    }
  }, [list, today])

  if (grouped.upcoming.length === 0 && grouped.past.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-10 w-10" />}
        title="Aucun rendez-vous"
        description="Les dossiers approuvés apparaîtront ici, regroupés par date de visite physique."
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Upcoming */}
      {grouped.upcoming.length > 0 && (
        <div className="space-y-3">
          {grouped.upcoming.map((g) => (
            <DateGroup
              key={g.key}
              dateKey={g.key}
              date={g.date}
              items={g.items}
              today={today}
              classeById={classeById}
              defaultExpanded={
                g.date.getTime() === today.getTime() || g.items.length <= 5
              }
            />
          ))}
        </div>
      )}

      {/* Past (no-shows or unfinalized) */}
      {grouped.past.length > 0 && (
        <PastSection groups={grouped.past} classeById={classeById} />
      )}
    </div>
  )
}

// ─── Date group card ──────────────────────────────────────────

function DateGroup({
  dateKey,
  date,
  items,
  today,
  classeById,
  defaultExpanded,
}: {
  dateKey: string
  date: Date
  items: PreInscription[]
  today: Date
  classeById: Map<string, Classe>
  defaultExpanded: boolean
}) {
  const [open, setOpen] = useState(defaultExpanded)
  const isToday = date.getTime() === today.getTime()

  return (
    <article
      className={cn(
        'rounded-lg border bg-white shadow-sm overflow-hidden',
        isToday ? 'border-info ring-2 ring-info/20' : 'border-ink-100'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-ink-50/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'shrink-0 flex h-9 w-9 items-center justify-center rounded-full ring-1',
              isToday
                ? 'bg-info text-white ring-info/40'
                : 'bg-info/10 text-info ring-info/20'
            )}
          >
            <CalendarClock className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h4 className="font-display font-bold text-[0.95rem] text-navy leading-tight">
              {dateKey}
              {isToday && <span className="ml-2 text-info">— aujourd'hui</span>}
            </h4>
            <p className="text-[0.7rem] text-ink-500">
              {items.length} dossier{items.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-ink-100 divide-y divide-ink-100">
          {items.map((d) => (
            <RvRow key={d.id} d={d} classeById={classeById} />
          ))}
        </div>
      )}
    </article>
  )
}

// ─── RV row ───────────────────────────────────────────────────

function RvRow({
  d,
  classeById,
}: {
  d: PreInscription
  classeById: Map<string, Classe>
}) {
  const { data: settings } = useSettingsInscription()
  const reprogMut = useReprogrammerRV()
  const deleteMut = useDeleteInscription()
  const toast = useToast()
  const confirm = useConfirm()

  const classe = d.classeCible ? classeById.get(d.classeCible) : undefined
  const classeLabel = classe ? nomClasse(classe) : '—'
  const reprogCount = d.reprogCount ?? 0
  const reprogsLeft = Math.max(0, REPROG_MAX - reprogCount)
  const placesParJour =
    settings?.rendezVousPlacesParJour ?? DEFAULT_PLACES_PAR_JOUR

  function whatsappLink(): string {
    // Strip non-digits for wa.me; +229 → 229
    const phone = (d.contactParent ?? '').replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Bonjour, c'est l'administration. Le dossier d'admission de ${d.nom} a été approuvé. ` +
        `Votre rendez-vous de dépôt physique est prévu pour le ${d.dateRV}. ` +
        `N'oubliez pas de venir avec votre code de suivi : ${d.trackingCode}.`
    )
    return `https://wa.me/${phone}?text=${msg}`
  }

  async function handleReprogrammer() {
    if (!d.dateRV) return
    if (reprogCount >= REPROG_MAX) {
      toast.error(`Limite de ${REPROG_MAX} reprogrammations atteinte.`)
      return
    }
    const ok = await confirm({
      title: 'Reprogrammer ce rendez-vous ?',
      message: `Le créneau du ${d.dateRV} sera libéré et le système attribuera la prochaine date disponible. Le parent verra le nouveau RV en consultant son code.`,
      confirmLabel: 'Reprogrammer',
    })
    if (!ok) return

    try {
      const res = await reprogMut.mutateAsync({
        inscriptionId: d.id,
        currentDateRV: d.dateRV,
        currentReprogCount: reprogCount,
        placesParJour,
      })
      toast.success(`Reprogrammé au ${res.dateRV}.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[reprogrammer admin] error:', err)
      toast.error(msg)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Annuler ce dossier ?',
      message: `Le dossier de ${d.nom} sera supprimé et son créneau du ${d.dateRV} sera libéré.`,
      confirmLabel: 'Annuler le dossier',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({
        inscriptionId: d.id,
        dateRV: d.dateRV,
      })
      toast.success('Dossier annulé.')
    } catch (err) {
      console.error('[delete] error:', err)
      toast.error('Échec de la suppression.')
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-700 font-bold text-[0.78rem]">
          {(d.nom ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h5 className="font-semibold text-[0.92rem] text-navy truncate">
                {d.nom}
              </h5>
              <div className="text-[0.72rem] text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Badge variant={d.genre === 'F' ? 'serie-a' : 'navy'} size="sm">
                  {d.genre}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <SchoolIcon className="h-3 w-3 text-ink-400" aria-hidden />
                  {classeLabel}
                </span>
                <span>·</span>
                <span className="font-mono text-[0.7rem]">{d.trackingCode}</span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-success/10 text-success-dark border border-success/20 hover:bg-success/15 px-2.5 py-1 text-[0.72rem] font-semibold min-h-touch"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              WhatsApp
            </a>
            <a
              href={`tel:${d.contactParent}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-info/10 text-info border border-info/20 hover:bg-info/15 px-2.5 py-1 text-[0.72rem] font-semibold min-h-touch"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono">{d.contactParent}</span>
            </a>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<RotateCw className="h-3.5 w-3.5" />}
              onClick={handleReprogrammer}
              disabled={reprogCount >= REPROG_MAX || reprogMut.isPending}
            >
              Reprogrammer
              {reprogsLeft < REPROG_MAX && ` (${reprogsLeft} restant${reprogsLeft > 1 ? 's' : ''})`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
            >
              Annuler
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Past section (no-shows) ──────────────────────────────────

function PastSection({
  groups,
  classeById,
}: {
  groups: Array<{ key: string; date: Date; items: PreInscription[] }>
  classeById: Map<string, Classe>
}) {
  const [open, setOpen] = useState(false)
  const total = groups.reduce((s, g) => s + g.items.length, 0)

  return (
    <div className="rounded-lg border border-warning/30 bg-warning-bg/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-warning-bg/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden />
          <p className="text-[0.85rem] font-semibold text-warning-dark">
            {total} rendez-vous passé{total > 1 ? 's' : ''} sans inscription officielle
          </p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-warning" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 text-warning" aria-hidden />
        )}
      </button>
      {open && (
        <div className="border-t border-warning/20 bg-white divide-y divide-ink-100">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="px-4 py-2 text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 bg-ink-50/40">
                {g.key}
              </p>
              {g.items.map((d) => (
                <RvRow key={d.id} d={d} classeById={classeById} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
