/**
 * RT-SC · Matières globales editor card.
 *
 * Add or remove subjects from the school-wide list. Used by:
 *   - Coefficients editor (one cell per matière)
 *   - Note entry (which matières apply per class)
 *   - Prof signup (multi-select of taught matières)
 *
 * Single doc at /ecole/matieres = { liste: string[] }.
 *
 * Removing a matière is non-destructive — it just removes the name from
 * this list. Existing notes for that matière keep working. But the
 * matière won't show up in dropdowns until added back.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Plus, X, Save, Sparkles } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useMatieres, useCleanupOrphanCoefficients, useRemoveMatiere, useUpdateMatieres } from '@/hooks/useMatieres'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

export function MatieresEditorCard() {
  const { data: stored, isLoading } = useMatieres()
  const updateMut = useUpdateMatieres()
  const removeMut = useRemoveMatiere()
  const cleanupMut = useCleanupOrphanCoefficients()
  const toast = useToast()
  const confirm = useConfirm()

  const [draft, setDraft] = useState<string[]>([])
  const [pending, setPending] = useState('')

  useEffect(() => {
    if (stored) setDraft([...stored])
  }, [stored])

  const isDirty = useMemo(() => {
    if (!stored) return false
    if (stored.length !== draft.length) return true
    return stored.some((m, i) => m !== draft[i])
  }, [stored, draft])

  function addMatiere() {
    const v = pending.trim()
    if (!v) return
    if (draft.some((m) => m.toLowerCase() === v.toLowerCase())) {
      toast.warning(`« ${v} » est déjà dans la liste.`)
      return
    }
    const next = [...draft, v].sort((a, b) => a.localeCompare(b, 'fr'))
    setDraft(next)
    setPending('')
  }

  async function removeMatiere(m: string) {
    const ok = await confirm({
      title: `Retirer « ${m} » ?`,
      message:
        `« ${m} » sera retirée de la liste des matières AINSI que de tous les coefficients déjà définis. ` +
        `Les notes déjà saisies pour cette matière restent dans la base mais n'apparaîtront plus dans les bulletins. ` +
        `Si vous re-ajoutez « ${m} » plus tard, vous devrez redéfinir ses coefficients par niveau.`,
      confirmLabel: 'Retirer',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const result = await removeMut.mutateAsync(m)
      // Local draft also stripped so the UI reflects the change immediately
      setDraft((d) => d.filter((x) => x !== m))
      const cleanedDocs = result.cleanedDocs
      toast.success(
        cleanedDocs > 0
          ? `« ${m} » retirée. Coefficient nettoyé dans ${cleanedDocs} niveau${cleanedDocs > 1 ? 'x' : ''}.`
          : `« ${m} » retirée.`
      )
    } catch (err) {
      console.error('[removeMatiere] failed:', err)
      toast.error("Échec du retrait. Voir la console.")
    }
  }

  async function save() {
    try {
      await updateMut.mutateAsync(draft)
      toast.success('Matières enregistrées.')
    } catch {
      toast.error("Échec de l'enregistrement.")
    }
  }

  async function runCleanup() {
    const ok = await confirm({
      title: 'Nettoyer les coefficients orphelins ?',
      message:
        "Cette action scanne tous les coefficients déjà définis et retire ceux qui ne correspondent plus à une matière de la liste actuelle. Utile si vous avez retiré une matière avant la mise à jour qui propageait automatiquement la suppression.",
      confirmLabel: 'Nettoyer',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const result = await cleanupMut.mutateAsync()
      if (result.keysRemoved === 0) {
        toast.success('Aucun orphelin trouvé. Tout est propre.')
      } else {
        toast.success(
          `${result.keysRemoved} entrée${result.keysRemoved > 1 ? 's' : ''} retirée${result.keysRemoved > 1 ? 's' : ''} dans ${result.docsAffected} niveau${result.docsAffected > 1 ? 'x' : ''}.`
        )
      }
    } catch (err) {
      console.error('[runCleanup] failed:', err)
      toast.error('Échec du nettoyage. Voir la console.')
    }
  }

  return (
    <Card accent>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-navy" aria-hidden />
            Matières enseignées
          </CardTitle>
          <CardDescription>
            Liste des matières utilisées dans les bulletins, coefficients et profils des professeurs.
          </CardDescription>
        </div>
      </CardHeader>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Add new */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addMatiere()
            }}
            className="flex gap-2"
          >
            <Input
              value={pending}
              onChange={(e) => setPending(e.target.value)}
              placeholder="Nouvelle matière (ex: Mathématiques)"
              autoCapitalize="words"
              containerClassName="flex-1"
            />
            <Button
              type="submit"
              disabled={!pending.trim()}
              leadingIcon={<Plus className="h-4 w-4" />}
            >
              Ajouter
            </Button>
          </form>

          {/* List */}
          {draft.length === 0 ? (
            <p className="text-center text-sm text-ink-400 italic py-4 border border-dashed border-ink-100 rounded-md">
              Aucune matière définie.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {draft.map((m) => (
                  <motion.div
                    key={m}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Badge
                      variant="navy"
                      size="md"
                      className="pr-1"
                    >
                      {m}
                      <button
                        type="button"
                        onClick={() => removeMatiere(m)}
                        aria-label={`Retirer ${m}`}
                        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/15 transition-colors"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </Badge>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          <p className="text-[0.78rem] text-ink-400">
            {draft.length} matière{draft.length > 1 ? 's' : ''}
          </p>

          <div className="flex justify-end">
            <Button
              onClick={save}
              disabled={!isDirty}
              loading={updateMut.isPending}
              leadingIcon={<Save className="h-4 w-4" />}
            >
              Enregistrer la liste
            </Button>
          </div>

          {/* Maintenance — collapsed by default, appears below the main controls */}
          <details className="rounded-md border border-ink-100 bg-ink-50/30 p-3 group">
            <summary className="cursor-pointer text-[0.78rem] font-semibold text-ink-500 inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-warning" aria-hidden />
              Maintenance
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-[0.78rem] text-ink-600 leading-snug">
                Si vous avez retiré une matière avant la mise à jour qui propage
                automatiquement la suppression aux coefficients, cette action
                nettoie les entrées orphelines.
              </p>
              <Button
                onClick={runCleanup}
                size="sm"
                variant="secondary"
                loading={cleanupMut.isPending}
                leadingIcon={<Sparkles className="h-3.5 w-3.5" />}
              >
                Nettoyer les coefficients orphelins
              </Button>
            </div>
          </details>
        </div>
      )}
    </Card>
  )
}
