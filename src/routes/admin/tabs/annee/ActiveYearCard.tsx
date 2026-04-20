/**
 * RT-SC · Active year card.
 *
 * Sets /ecole/config.anneeActive — the year string (e.g. "2026-2027") used
 * across the app to stamp new classes, paiements, etc.
 *
 * Format validated: NNNN-NNNN with consecutive years. The default suggestion
 * is the current academic year computed from "now".
 */

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Save, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import {
  useEcoleConfig,
  useUpdateEcoleConfig,
} from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'

const ANNEE_REGEX = /^(\d{4})-(\d{4})$/

/** Suggest the current academic year (Bénin school year starts in October). */
function suggestedAnnee(): string {
  const now = new Date()
  const month = now.getMonth() + 1  // 1-12
  const year = now.getFullYear()
  // School year runs Oct → June. After September, current year is the start.
  if (month >= 10) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

export function ActiveYearCard() {
  const { data: config, isLoading } = useEcoleConfig()
  const updateMut = useUpdateEcoleConfig()
  const toast = useToast()

  const [annee, setAnnee] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) setAnnee(config.anneeActive ?? '')
  }, [config])

  const isDirty = useMemo(
    () => annee.trim() !== (config?.anneeActive ?? ''),
    [annee, config]
  )

  const validation = useMemo<{ ok: boolean; reason?: string }>(() => {
    if (!annee.trim()) return { ok: false, reason: '' }
    const m = annee.trim().match(ANNEE_REGEX)
    if (!m) return { ok: false, reason: 'Format attendu : AAAA-AAAA' }
    const start = parseInt(m[1], 10)
    const end = parseInt(m[2], 10)
    if (end !== start + 1) {
      return { ok: false, reason: 'Les deux années doivent être consécutives.' }
    }
    if (start < 2020 || start > 2100) {
      return { ok: false, reason: 'Année hors plage raisonnable.' }
    }
    return { ok: true }
  }, [annee])

  async function save() {
    setError(null)
    if (!validation.ok) return setError(validation.reason ?? 'Format invalide.')

    try {
      await updateMut.mutateAsync({ anneeActive: annee.trim() })
      toast.success(`Année active : ${annee.trim()}`)
    } catch {
      setError("Erreur lors de l'enregistrement.")
    }
  }

  function suggest() {
    setAnnee(suggestedAnnee())
    setError(null)
  }

  return (
    <Card accent>
      <CardHeader>
        <div>
          <CardTitle>Année scolaire active</CardTitle>
          <CardDescription>
            Stampée sur les nouvelles classes et utilisée pour les bulletins de l'année.
          </CardDescription>
        </div>
      </CardHeader>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="Année scolaire"
            value={annee}
            onChange={(e) => {
              setAnnee(e.target.value)
              setError(null)
            }}
            placeholder="2026-2027"
            inputMode="numeric"
            maxLength={9}
            leading={<CalendarDays className="h-4 w-4" />}
            error={error ?? undefined}
            hint={!error && validation.reason ? validation.reason : undefined}
          />

          {!config?.anneeActive && (
            <div className="flex items-start gap-2 rounded-md bg-warning-bg border border-warning/20 px-3 py-2.5">
              <AlertCircle
                className="h-4 w-4 text-warning shrink-0 mt-0.5"
                aria-hidden
              />
              <p className="text-[0.8125rem] text-warning leading-snug">
                <strong>Aucune année configurée.</strong> Définissez-la avant
                de créer des classes.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={suggest}
              disabled={annee === suggestedAnnee()}
            >
              Utiliser : {suggestedAnnee()}
            </Button>
            <Button
              onClick={save}
              disabled={!isDirty || !validation.ok}
              loading={updateMut.isPending}
              leadingIcon={<Save className="h-4 w-4" />}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
