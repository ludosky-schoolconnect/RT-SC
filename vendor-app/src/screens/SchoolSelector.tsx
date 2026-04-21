/**
 * Vendor · Screen 1 — School selector.
 *
 * Entry point. Shows saved schools sorted by most recently used.
 * Empty state prompts to add first school.
 */

import { useState } from 'react'
import { School, Plus, Clock, Trash2, Database } from 'lucide-react'
import { useSession } from '@/lib/session'
import { removeSchool, type SavedSchool } from '@/lib/schoolsStorage'
import { Button } from '@/ui/Button'
import { AddSchoolDialog } from './AddSchoolDialog'

export function SchoolSelector() {
  const { schools, refreshSchools, pickSchool } = useSession()
  const [showAdd, setShowAdd] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)

  async function handlePick(school: SavedSchool) {
    setConnectingId(school.id)
    try {
      await pickSchool(school)
    } catch {
      alert(
        `Impossible de se connecter à ${school.name}. Vérifiez la configuration Firebase.`
      )
    } finally {
      setConnectingId(null)
    }
  }

  function handleRemove(school: SavedSchool) {
    if (!confirm(`Supprimer ${school.name} de la liste ?`)) return
    removeSchool(school.id)
    refreshSchools()
  }

  return (
    <div>
      <div className="mb-5">
        <p className="text-[0.7rem] uppercase tracking-widest font-bold text-gold-dark mb-1">
          Sélection
        </p>
        <h1 className="font-display text-2xl font-bold text-navy tracking-tight leading-tight">
          Quelle école gérer ?
        </h1>
        <p className="text-[0.85rem] text-ink-500 mt-1 leading-relaxed">
          Choisissez une école enregistrée ou ajoutez-en une nouvelle.
        </p>
      </div>

      {schools.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-2">
          {schools.map((school) => (
            <SchoolRow
              key={school.id}
              school={school}
              connecting={connectingId === school.id}
              disabled={connectingId !== null && connectingId !== school.id}
              onPick={() => handlePick(school)}
              onRemove={() => handleRemove(school)}
            />
          ))}

          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink-200 hover:border-navy/40 hover:bg-info-bg/50 text-ink-500 hover:text-navy px-4 py-3.5 text-[0.85rem] font-semibold transition-colors min-h-touch mt-4"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Ajouter une école
          </button>
        </div>
      )}

      <AddSchoolDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => {
          setShowAdd(false)
          refreshSchools()
        }}
      />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl bg-white border-[1.5px] border-ink-100 px-6 py-10 text-center shadow-xs">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-info-bg border border-navy/15 mb-3">
        <Database className="h-5 w-5 text-navy" aria-hidden />
      </div>
      <p className="font-display text-lg font-bold text-navy">
        Aucune école enregistrée
      </p>
      <p className="text-[0.85rem] text-ink-500 mt-2 leading-relaxed max-w-sm mx-auto">
        Ajoutez votre première école pour commencer. Vous aurez besoin de
        la configuration Firebase de l'école.
      </p>
      <Button variant="primary" icon={<Plus />} onClick={onAdd} className="mt-5">
        Ajouter une école
      </Button>
    </div>
  )
}

function SchoolRow({
  school,
  connecting,
  disabled,
  onPick,
  onRemove,
}: {
  school: SavedSchool
  connecting: boolean
  disabled: boolean
  onPick: () => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-md bg-white border-[1.5px] border-ink-100 hover:border-navy/25 transition-colors shadow-xs flex items-stretch">
      <button
        type="button"
        onClick={onPick}
        disabled={disabled || connecting}
        className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50 disabled:cursor-not-allowed min-h-touch"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-bg border border-navy/15 shrink-0">
          <School className="h-4 w-4 text-navy" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.98rem] font-semibold text-navy leading-tight truncate">
            {school.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[0.72rem] text-ink-400">
            <span className="font-mono truncate">
              {school.config.projectId}
            </span>
            {school.lastUsed && (
              <>
                <span className="text-ink-300">·</span>
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="shrink-0">
                  {formatRelativeDate(school.lastUsed)}
                </span>
              </>
            )}
          </div>
        </div>
        {connecting && (
          <span className="text-[0.72rem] text-navy font-semibold">
            Connexion…
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={connecting}
        aria-label={`Supprimer ${school.name}`}
        className="flex items-center justify-center w-10 text-ink-300 hover:text-danger hover:bg-danger-bg/50 transition-colors border-l border-ink-100 rounded-r-md disabled:opacity-30"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

function formatRelativeDate(ts: number): string {
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "à l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `il y a ${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'hier'
  if (diffDay < 7) return `il y a ${diffDay}j`
  const d = new Date(ts)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
