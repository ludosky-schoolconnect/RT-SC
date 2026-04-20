/**
 * RT-SC · Coefficients editor card.
 *
 * Pick a (niveau, série) — premier cycle has no série, second cycle does.
 * Edit a number per matière (the coefficient that multiplies the moyenne
 * matière in the bulletin). The "Conduite" coefficient is always present
 * and editable.
 *
 * Saves to /ecole/coefficients_{niveau}-{serie|null}.
 *
 * Notes:
 *   - Coefficients of 0 are stripped (treated as "matière not taught at this level")
 *   - Decimals allowed (e.g. 2.5)
 */

import { useEffect, useMemo, useState } from 'react'
import { Calculator, Save, AlertCircle, Info } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useMatieres } from '@/hooks/useMatieres'
import { useCoefficients, useUpdateCoefficients } from '@/hooks/useCoefficients'
import { useToast } from '@/stores/toast'
import {
  NIVEAUX_PREMIER,
  NIVEAUX_SECOND,
  SERIES,
} from '@/lib/benin'
import type { CoefficientsDoc, Niveau, Serie } from '@/types/models'

const CONDUITE_KEY = 'Conduite'

export function CoefficientsEditorCard() {
  const toast = useToast()
  const { data: matieres = [], isLoading: matieresLoading } = useMatieres()

  const [cycle, setCycle] = useState<'premier' | 'second'>('premier')
  const [niveau, setNiveau] = useState<Niveau | ''>('')
  const [serie, setSerie] = useState<Serie | ''>('')

  const { data: stored, isLoading: storedLoading } = useCoefficients(
    niveau || null,
    cycle === 'second' ? (serie as Serie | null) || null : null
  )
  const updateMut = useUpdateCoefficients()

  const [draft, setDraft] = useState<CoefficientsDoc>({})

  // Hydrate draft when target or stored data changes
  useEffect(() => {
    if (stored) setDraft({ ...stored })
  }, [stored])

  // Reset niveau/serie when cycle changes
  useEffect(() => {
    setNiveau('')
    setSerie('')
    setDraft({})
  }, [cycle])

  const niveauOptions = useMemo(
    () => (cycle === 'premier' ? NIVEAUX_PREMIER : NIVEAUX_SECOND),
    [cycle]
  )

  // The full row list: matières + Conduite at the end
  const rows = useMemo(() => {
    const list = [...matieres]
    if (!list.includes(CONDUITE_KEY)) list.push(CONDUITE_KEY)
    return list
  }, [matieres])

  const ready =
    !!niveau && (cycle === 'premier' || (cycle === 'second' && !!serie))

  const isDirty = useMemo(() => {
    if (!stored) return false
    const keys = new Set([...Object.keys(stored), ...Object.keys(draft)])
    for (const k of keys) {
      if ((stored[k] ?? 0) !== (draft[k] ?? 0)) return true
    }
    return false
  }, [stored, draft])

  function setCoeff(matiere: string, raw: string) {
    if (raw === '') {
      const next = { ...draft }
      delete next[matiere]
      setDraft(next)
      return
    }
    const v = parseFloat(raw)
    if (isNaN(v) || v < 0) return
    setDraft((d) => ({ ...d, [matiere]: v }))
  }

  async function save() {
    if (!ready) return
    try {
      await updateMut.mutateAsync({
        niveau: niveau as Niveau,
        serie: cycle === 'second' ? ((serie as Serie | null) || null) : null,
        coefficients: draft,
      })
      toast.success(
        `Coefficients enregistrés pour ${niveau}${cycle === 'second' && serie ? ` ${serie}` : ''}.`
      )
    } catch {
      toast.error("Échec de l'enregistrement.")
    }
  }

  return (
    <Card accent>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-navy" aria-hidden />
            Coefficients
          </CardTitle>
          <CardDescription>
            Coefficients par niveau et série, utilisés dans le calcul des bulletins.
          </CardDescription>
        </div>
      </CardHeader>

      <div className="space-y-4">
        {/* Cycle / niveau / série pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Cycle"
            value={cycle}
            onChange={(e) => setCycle(e.target.value as 'premier' | 'second')}
          >
            <option value="premier">Premier cycle</option>
            <option value="second">Second cycle</option>
          </Select>
          <Select
            label="Niveau"
            value={niveau}
            onChange={(e) => setNiveau(e.target.value as Niveau | '')}
          >
            <option value="">— Choisir —</option>
            {niveauOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          {cycle === 'second' && (
            <Select
              label="Série"
              value={serie}
              onChange={(e) => setSerie(e.target.value as Serie | '')}
            >
              <option value="">— Choisir —</option>
              {SERIES.map((s) => (
                <option key={s} value={s}>
                  Série {s}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Body */}
        {!ready ? (
          <div className="rounded-md bg-info-bg border border-navy/15 px-4 py-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
            <p className="text-[0.8125rem] text-navy">
              Choisissez le niveau{cycle === 'second' ? ' et la série' : ''} ci-dessus
              pour modifier les coefficients.
            </p>
          </div>
        ) : matieresLoading || storedLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : matieres.length === 0 ? (
          <div className="rounded-md bg-warning-bg border border-warning/30 px-4 py-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
            <p className="text-[0.8125rem] text-warning">
              Définissez d'abord les matières dans la section précédente.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-ink-100 bg-white divide-y divide-ink-100">
              {rows.map((m) => {
                const isConduite = m === CONDUITE_KEY
                return (
                  <div
                    key={m}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span
                      className={
                        isConduite
                          ? 'flex-1 font-display font-semibold text-warning text-[0.875rem]'
                          : 'flex-1 font-semibold text-navy text-[0.875rem]'
                      }
                    >
                      {m}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min={0}
                      max={20}
                      value={draft[m] ?? ''}
                      onChange={(e) => setCoeff(m, e.target.value)}
                      placeholder="—"
                      containerClassName="w-24"
                      className="text-center"
                    />
                  </div>
                )
              })}
            </div>

            <p className="text-[0.78rem] text-ink-400">
              Laissez vide pour exclure une matière à ce niveau. La note de
              conduite est multipliée par son propre coefficient comme une matière.
            </p>

            <div className="flex justify-end">
              <Button
                onClick={save}
                disabled={!isDirty}
                loading={updateMut.isPending}
                leadingIcon={<Save className="h-4 w-4" />}
              >
                Enregistrer
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
