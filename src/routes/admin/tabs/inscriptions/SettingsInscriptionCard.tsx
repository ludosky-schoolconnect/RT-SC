/**
 * RT-SC · Settings inscription card.
 *
 * Admin editor for what the public form requires:
 *   - Categories of applicants (e.g. "Nouveaux élèves" vs "Anciens élèves")
 *     each with their own document checklist
 *   - Or — for simple schools — a flat document list (no category picker)
 *   - Materiel list (free-text items parents must bring)
 *   - RV configuration (places/jour, délai minimum)
 *
 * Two modes:
 *   - "Liste simple" — flat docs, no categories
 *   - "Catégories" — categorized docs, parent picks a category first
 *
 * Switching mode preserves data on the side that's currently visible.
 *
 * Visual editor — no magic-string syntax. Required toggle per doc,
 * add/remove buttons, category collapse/expand.
 */

import { useEffect, useState } from 'react'
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Layers,
  List,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/cn'
import {
  useSettingsInscription,
  useUpdateSettingsInscription,
} from '@/hooks/useSettingsInscription'
import {
  DEFAULT_DELAI_MIN_JOURS,
  DEFAULT_PLACES_PAR_JOUR,
} from '@/lib/inscription-rdv'
import type {
  InscriptionCategorie,
  InscriptionDocSpec,
} from '@/types/models'

type Mode = 'simple' | 'categories'

export function SettingsInscriptionCard() {
  const { data: settings, isLoading } = useSettingsInscription()
  const updateMut = useUpdateSettingsInscription()
  const toast = useToast()

  const [mode, setMode] = useState<Mode>('simple')
  const [categories, setCategories] = useState<InscriptionCategorie[]>([])
  const [docsSimple, setDocsSimple] = useState<InscriptionDocSpec[]>([])
  const [materiel, setMateriel] = useState<string[]>([])
  const [places, setPlaces] = useState(String(DEFAULT_PLACES_PAR_JOUR))
  const [delai, setDelai] = useState(String(DEFAULT_DELAI_MIN_JOURS))

  // Sync local state from server data
  useEffect(() => {
    if (!settings) return
    if (settings.categories && settings.categories.length > 0) {
      setMode('categories')
      setCategories(settings.categories)
      setDocsSimple(settings.documentsSimple ?? [])
    } else {
      setMode('simple')
      setDocsSimple(settings.documentsSimple ?? [])
      setCategories(settings.categories ?? [])
    }
    setMateriel(settings.materiel ?? [])
    setPlaces(
      String(settings.rendezVousPlacesParJour ?? DEFAULT_PLACES_PAR_JOUR)
    )
    setDelai(String(settings.rendezVousDelaiMinJours ?? DEFAULT_DELAI_MIN_JOURS))
  }, [settings])

  async function save() {
    try {
      await updateMut.mutateAsync({
        categories: mode === 'categories' ? categories : [],
        documentsSimple: mode === 'simple' ? docsSimple : [],
        materiel: materiel.filter((m) => m.trim()),
        rendezVousPlacesParJour: Math.max(1, Number(places) || 1),
        rendezVousDelaiMinJours: Math.max(1, Number(delai) || 1),
      })
      toast.success('Paramètres enregistrés.')
    } catch (err) {
      console.error('[settings inscription] save error:', err)
      toast.error("Échec de l'enregistrement.")
    }
  }

  if (isLoading && !settings) {
    return (
      <Card>
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    )
  }

  return (
    <Card accent>
      <CardHeader>
        <div>
          <CardTitle>Configuration des inscriptions</CardTitle>
          <CardDescription>
            Documents requis, matériel exigé et créneaux de rendez-vous.
            Affecte le formulaire public et le calcul automatique des RV.
          </CardDescription>
        </div>
      </CardHeader>

      <div className="space-y-5">
        {/* Mode toggle */}
        <div className="inline-flex items-center gap-1 rounded-lg bg-ink-100/60 p-1">
          <ModeBtn
            active={mode === 'simple'}
            icon={<List className="h-3.5 w-3.5" />}
            label="Liste simple"
            onClick={() => setMode('simple')}
          />
          <ModeBtn
            active={mode === 'categories'}
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Catégories"
            onClick={() => setMode('categories')}
          />
        </div>

        {/* Documents editor */}
        {mode === 'simple' ? (
          <SimpleDocsEditor docs={docsSimple} onChange={setDocsSimple} />
        ) : (
          <CategoriesEditor
            categories={categories}
            onChange={setCategories}
          />
        )}

        {/* Materiel */}
        <MaterielEditor materiel={materiel} onChange={setMateriel} />

        {/* RV settings */}
        <div className="rounded-md bg-info-bg/40 border border-info/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="h-4 w-4 text-info" aria-hidden />
            <h4 className="font-semibold text-[0.85rem] text-navy">
              Calcul des rendez-vous
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.78rem] font-semibold text-ink-700 mb-1">
                Places par jour
              </label>
              <Input
                type="number"
                inputMode="numeric"
                value={places}
                onChange={(e) => setPlaces(e.target.value)}
                min={1}
                max={500}
              />
              <p className="text-[0.7rem] text-ink-500 mt-1">
                Nombre maximum de RV physiques par journée ouvrée.
              </p>
            </div>
            <div>
              <label className="block text-[0.78rem] font-semibold text-ink-700 mb-1">
                Délai minimum (jours)
              </label>
              <Input
                type="number"
                inputMode="numeric"
                value={delai}
                onChange={(e) => setDelai(e.target.value)}
                min={1}
                max={30}
              />
              <p className="text-[0.7rem] text-ink-500 mt-1">
                Au plus tôt à <strong>aujourd'hui + N jours</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={save}
            loading={updateMut.isPending}
            leadingIcon={<Save className="h-4 w-4" />}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ─── Simple flat docs editor ─────────────────────────────────

function SimpleDocsEditor({
  docs,
  onChange,
}: {
  docs: InscriptionDocSpec[]
  onChange: (next: InscriptionDocSpec[]) => void
}) {
  function add() {
    onChange([...docs, { nom: '', requis: true }])
  }
  function update(i: number, patch: Partial<InscriptionDocSpec>) {
    onChange(docs.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }
  function remove(i: number) {
    onChange(docs.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
        Documents demandés
      </p>
      <div className="space-y-2">
        {docs.length === 0 ? (
          <p className="text-[0.78rem] text-ink-400 italic px-2 py-3 rounded-md bg-ink-50/40">
            Aucun document. Cliquez sur « Ajouter » pour commencer.
          </p>
        ) : (
          docs.map((d, i) => (
            <DocRow
              key={i}
              doc={d}
              onUpdate={(patch) => update(i, patch)}
              onRemove={() => remove(i)}
            />
          ))
        )}
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={add}
        >
          Ajouter un document
        </Button>
      </div>
    </div>
  )
}

// ─── Categorized docs editor ─────────────────────────────────

function CategoriesEditor({
  categories,
  onChange,
}: {
  categories: InscriptionCategorie[]
  onChange: (next: InscriptionCategorie[]) => void
}) {
  function addCategory() {
    onChange([...categories, { nom: '', documents: [] }])
  }
  function updateCategory(i: number, patch: Partial<InscriptionCategorie>) {
    onChange(categories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function removeCategory(i: number) {
    onChange(categories.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
        Catégories d'inscriptions
      </p>
      <p className="text-[0.72rem] text-ink-500 mb-3 px-1">
        Le formulaire affichera un sélecteur de catégorie au parent. Selon
        son choix, les documents demandés changent.
      </p>
      <div className="space-y-3">
        {categories.length === 0 ? (
          <p className="text-[0.78rem] text-ink-400 italic px-2 py-3 rounded-md bg-ink-50/40">
            Aucune catégorie. Ajoutez-en pour différencier les profils
            (ex. « Nouveaux » vs « Anciens »).
          </p>
        ) : (
          categories.map((cat, i) => (
            <CategoryRow
              key={i}
              category={cat}
              onUpdate={(patch) => updateCategory(i, patch)}
              onRemove={() => removeCategory(i)}
            />
          ))
        )}
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={addCategory}
        >
          Ajouter une catégorie
        </Button>
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  onUpdate,
  onRemove,
}: {
  category: InscriptionCategorie
  onUpdate: (patch: Partial<InscriptionCategorie>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(true)

  function addDoc() {
    onUpdate({ documents: [...category.documents, { nom: '', requis: true }] })
  }
  function updateDoc(i: number, patch: Partial<InscriptionDocSpec>) {
    onUpdate({
      documents: category.documents.map((d, idx) =>
        idx === i ? { ...d, ...patch } : d
      ),
    })
  }
  function removeDoc(i: number) {
    onUpdate({
      documents: category.documents.filter((_, idx) => idx !== i),
    })
  }

  return (
    <div className="rounded-lg border border-ink-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-ink-400 hover:text-navy"
          aria-label={open ? 'Replier' : 'Déplier'}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <ClipboardList className="h-4 w-4 text-navy shrink-0" aria-hidden />
        <Input
          value={category.nom}
          onChange={(e) => onUpdate({ nom: e.target.value })}
          placeholder="Nom de la catégorie (ex. Nouveaux élèves)"
          className="flex-1 !font-semibold"
        />
        <span className="text-[0.7rem] text-ink-400 shrink-0">
          {category.documents.length} doc{category.documents.length > 1 ? 's' : ''}
        </span>
        <IconButton
          variant="danger"
          aria-label="Supprimer la catégorie"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
      {open && (
        <div className="border-t border-ink-100 p-3 bg-ink-50/30 space-y-2">
          {category.documents.length === 0 ? (
            <p className="text-[0.72rem] text-ink-400 italic px-1">
              Aucun document dans cette catégorie.
            </p>
          ) : (
            category.documents.map((d, i) => (
              <DocRow
                key={i}
                doc={d}
                onUpdate={(patch) => updateDoc(i, patch)}
                onRemove={() => removeDoc(i)}
              />
            ))
          )}
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={addDoc}
          >
            Ajouter un document
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Doc row (used by both modes) ─────────────────────────────

function DocRow({
  doc,
  onUpdate,
  onRemove,
}: {
  doc: InscriptionDocSpec
  onUpdate: (patch: Partial<InscriptionDocSpec>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-white p-2 flex items-center gap-2">
      <Input
        value={doc.nom}
        onChange={(e) => onUpdate({ nom: e.target.value })}
        placeholder="Ex : Acte de naissance"
        className="flex-1"
      />
      <label className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-ink-700 select-none cursor-pointer shrink-0 px-1">
        <input
          type="checkbox"
          checked={doc.requis}
          onChange={(e) => onUpdate({ requis: e.target.checked })}
          className="h-4 w-4 rounded border-ink-300 text-navy focus:ring-navy/30"
        />
        Requis
      </label>
      <IconButton
        variant="danger"
        aria-label="Supprimer le document"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

// ─── Materiel ─────────────────────────────────────────────────

function MaterielEditor({
  materiel,
  onChange,
}: {
  materiel: string[]
  onChange: (next: string[]) => void
}) {
  function add() {
    onChange([...materiel, ''])
  }
  function update(i: number, value: string) {
    onChange(materiel.map((m, idx) => (idx === i ? value : m)))
  }
  function remove(i: number) {
    onChange(materiel.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400 mb-2 px-1">
        Matériel à apporter
      </p>
      <p className="text-[0.72rem] text-ink-500 mb-2 px-1">
        Liste affichée au parent dans le formulaire (cahiers, uniforme, etc.).
      </p>
      <div className="space-y-2">
        {materiel.length === 0 ? (
          <p className="text-[0.78rem] text-ink-400 italic px-2 py-2 rounded-md bg-ink-50/40">
            Aucun matériel listé.
          </p>
        ) : (
          materiel.map((m, i) => (
            <div
              key={i}
              className="rounded-md border border-ink-100 bg-white p-2 flex items-center gap-2"
            >
              <Input
                value={m}
                onChange={(e) => update(i, e.target.value)}
                placeholder="Ex : 5 cahiers de 200 pages"
                className="flex-1"
              />
              <IconButton
                variant="danger"
                aria-label="Supprimer"
                onClick={() => remove(i)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ))
        )}
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={add}
        >
          Ajouter un élément
        </Button>
      </div>
    </div>
  )
}

// ─── Mode button ──────────────────────────────────────────────

function ModeBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.78rem] font-semibold transition-all',
        active
          ? 'bg-white text-navy shadow-sm ring-1 ring-navy/10'
          : 'text-ink-500 hover:text-navy'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
