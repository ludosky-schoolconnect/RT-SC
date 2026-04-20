/**
 * RT-SC · Bulletin config card.
 *
 * Four settings that drive how bulletins are computed:
 *   - typePeriode  : "Trimestre" | "Semestre"
 *   - nbPeriodes   : 1-4 (typically 3 for trimestre, 2 for semestre)
 *   - baseConduite : 0-20 (max conduite score before colle deductions)
 *   - periodeDates : optional per-period start/end dates (NEW Phase 4b.1)
 *
 * When period dates are set, the app uses them everywhere to detect the
 * current period (Notes tab default, future closure flows). When unset,
 * falls back to a Bénin school calendar guess.
 */

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Save, Info, Calendar } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Checkbox'
import { Spinner } from '@/components/ui/Spinner'
import {
  useBulletinConfig,
  useUpdateBulletinConfig,
} from '@/hooks/useBulletinConfig'
import { useToast } from '@/stores/toast'
import { listPeriodes } from '@/lib/bulletin'
import type { BulletinConfig, PeriodeRange } from '@/types/models'

export function BulletinConfigCard() {
  const { data: config, isLoading } = useBulletinConfig()
  const updateMut = useUpdateBulletinConfig()
  const toast = useToast()

  const [typePeriode, setTypePeriode] = useState<BulletinConfig['typePeriode']>('Trimestre')
  const [nbPeriodes, setNbPeriodes] = useState<number>(3)
  const [baseConduite, setBaseConduite] = useState<number>(20)
  const [periodeDates, setPeriodeDates] = useState<Record<string, PeriodeRange>>({})
  const [formuleAnnuelle, setFormuleAnnuelle] = useState<NonNullable<BulletinConfig['formuleAnnuelle']>>('standard')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) {
      setTypePeriode(config.typePeriode)
      setNbPeriodes(config.nbPeriodes)
      setBaseConduite(config.baseConduite)
      setPeriodeDates(config.periodeDates ?? {})
      setFormuleAnnuelle(config.formuleAnnuelle ?? 'standard')
    }
  }, [config])

  // The list of period names that should have date editors
  const periodNames = useMemo(
    () => listPeriodes(typePeriode, nbPeriodes),
    [typePeriode, nbPeriodes]
  )

  const isDirty = useMemo(() => {
    if (!config) return false
    if (typePeriode !== config.typePeriode) return true
    if (nbPeriodes !== config.nbPeriodes) return true
    if (baseConduite !== config.baseConduite) return true
    if ((config.formuleAnnuelle ?? 'standard') !== formuleAnnuelle) return true
    // Compare period dates (shallow)
    const stored = config.periodeDates ?? {}
    const allKeys = new Set([...Object.keys(stored), ...Object.keys(periodeDates)])
    for (const k of allKeys) {
      const s = stored[k]
      const d = periodeDates[k]
      if ((s?.debut ?? '') !== (d?.debut ?? '')) return true
      if ((s?.fin ?? '') !== (d?.fin ?? '')) return true
    }
    return false
  }, [config, typePeriode, nbPeriodes, baseConduite, periodeDates, formuleAnnuelle])

  // When typePeriode changes, set the natural default for nbPeriodes
  function changeTypePeriode(t: BulletinConfig['typePeriode']) {
    setTypePeriode(t)
    setNbPeriodes(t === 'Semestre' ? 2 : 3)
  }

  function setPeriodDate(periodName: string, field: 'debut' | 'fin', value: string) {
    setPeriodeDates((prev) => ({
      ...prev,
      [periodName]: {
        debut: prev[periodName]?.debut ?? '',
        fin: prev[periodName]?.fin ?? '',
        [field]: value,
      },
    }))
  }

  // Validation: each period (if both dates set) must have debut <= fin
  const dateErrors = useMemo(() => {
    const errs: string[] = []
    for (const name of periodNames) {
      const r = periodeDates[name]
      if (r?.debut && r?.fin && r.debut > r.fin) {
        errs.push(`${name} : la date de début est après la date de fin.`)
      }
    }
    return errs
  }, [periodNames, periodeDates])

  async function save() {
    setError(null)
    if (nbPeriodes < 1 || nbPeriodes > 4) {
      return setError('Le nombre de périodes doit être entre 1 et 4.')
    }
    if (baseConduite < 0 || baseConduite > 20) {
      return setError('La note de conduite de base doit être entre 0 et 20.')
    }
    if (dateErrors.length > 0) {
      return setError(dateErrors[0])
    }

    // Strip empty/partial entries from periodeDates so we don't store junk
    const cleanedDates: Record<string, PeriodeRange> = {}
    for (const name of periodNames) {
      const r = periodeDates[name]
      if (r?.debut && r?.fin) {
        cleanedDates[name] = { debut: r.debut, fin: r.fin }
      }
    }

    try {
      await updateMut.mutateAsync({
        typePeriode,
        nbPeriodes,
        baseConduite,
        periodeDates: cleanedDates,
        formuleAnnuelle,
      })
      toast.success('Paramètres de bulletin enregistrés.')
    } catch {
      setError("Erreur lors de l'enregistrement.")
    }
  }

  // Count how many periods have complete dates
  const datesConfiguredCount = periodNames.filter(
    (n) => periodeDates[n]?.debut && periodeDates[n]?.fin
  ).length

  return (
    <Card accent>
      <CardHeader>
        <div>
          <CardTitle>Paramètres des bulletins</CardTitle>
          <CardDescription>
            Périodicité, nombre de périodes, note de conduite et dates des périodes.
          </CardDescription>
        </div>
      </CardHeader>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Type de période */}
          <fieldset>
            <legend className="text-[0.8125rem] font-semibold text-ink-800 mb-2 inline-flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-ink-400" aria-hidden />
              Type de période
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <Radio
                name="typePeriode"
                checked={typePeriode === 'Trimestre'}
                onChange={() => changeTypePeriode('Trimestre')}
                label="Trimestre"
                description="3 périodes par défaut"
                containerClassName="bg-white border border-ink-100 hover:border-navy rounded-md p-3 transition-colors"
              />
              <Radio
                name="typePeriode"
                checked={typePeriode === 'Semestre'}
                onChange={() => changeTypePeriode('Semestre')}
                label="Semestre"
                description="2 périodes par défaut"
                containerClassName="bg-white border border-ink-100 hover:border-navy rounded-md p-3 transition-colors"
              />
            </div>
          </fieldset>

          {/* Nombre de périodes */}
          <Select
            label="Nombre de périodes"
            value={String(nbPeriodes)}
            onChange={(e) => setNbPeriodes(parseInt(e.target.value, 10))}
            hint="Habituellement 3 pour Trimestre, 2 pour Semestre."
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={String(n)}>
                {n} {typePeriode.toLowerCase()}
                {n > 1 ? 's' : ''}
              </option>
            ))}
          </Select>

          {/* Base conduite */}
          <Input
            label="Note de conduite de base"
            type="number"
            value={baseConduite}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setBaseConduite(isNaN(v) ? 0 : v)
              setError(null)
            }}
            min={0}
            max={20}
            hint="Note maximale, avant déductions des heures de colle (1 pt par 2 h)."
          />

          {/* Formule moyenne annuelle */}
          <div>
            <p className="text-[0.8125rem] font-semibold text-ink-800 mb-2">
              Formule moyenne annuelle
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <label
                className={[
                  'flex-1 flex items-start gap-2 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                  formuleAnnuelle === 'standard'
                    ? 'border-navy bg-info-bg/40'
                    : 'border-ink-100 hover:border-ink-200 bg-white',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="formuleAnnuelle"
                  checked={formuleAnnuelle === 'standard'}
                  onChange={() => setFormuleAnnuelle('standard')}
                  className="mt-0.5 accent-navy"
                />
                <div>
                  <p className="font-semibold text-navy text-[0.8125rem] leading-tight">
                    Standard <span className="text-gold-dark text-[0.7rem]">(Bénin)</span>
                  </p>
                  <p className="text-[0.7rem] text-ink-500 mt-0.5 leading-snug">
                    La dernière période compte double. Ex. semestres&nbsp;:
                    (S1 + S2×2) / 3.
                  </p>
                </div>
              </label>
              <label
                className={[
                  'flex-1 flex items-start gap-2 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                  formuleAnnuelle === 'simple'
                    ? 'border-navy bg-info-bg/40'
                    : 'border-ink-100 hover:border-ink-200 bg-white',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="formuleAnnuelle"
                  checked={formuleAnnuelle === 'simple'}
                  onChange={() => setFormuleAnnuelle('simple')}
                  className="mt-0.5 accent-navy"
                />
                <div>
                  <p className="font-semibold text-navy text-[0.8125rem] leading-tight">
                    Simple
                  </p>
                  <p className="text-[0.7rem] text-ink-500 mt-0.5 leading-snug">
                    Moyenne arithmétique de toutes les périodes, à poids égaux.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Period dates editor (NEW) */}
          <div>
            <p className="text-[0.8125rem] font-semibold text-ink-800 mb-2 inline-flex items-center gap-2">
              <Calendar className="h-4 w-4 text-ink-400" aria-hidden />
              Dates des périodes
              {datesConfiguredCount > 0 && (
                <span className="text-[0.7rem] font-normal text-ink-400">
                  ({datesConfiguredCount}/{periodNames.length} configurée
                  {datesConfiguredCount > 1 ? 's' : ''})
                </span>
              )}
            </p>
            <div className="rounded-md bg-info-bg/50 border border-navy/15 px-3 py-2.5 mb-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
              <p className="text-[0.78rem] text-navy leading-snug">
                Définir les dates de chaque période rend la sélection automatique
                plus précise pour les professeurs et les bulletins. Sans dates,
                un calendrier scolaire bénin par défaut est utilisé.
              </p>
            </div>
            <div className="space-y-2">
              {periodNames.map((name) => (
                <div key={name} className="rounded-md border border-ink-100 bg-white p-3">
                  <p className="text-[0.78rem] font-semibold text-navy mb-2">{name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Début"
                      type="date"
                      value={periodeDates[name]?.debut ?? ''}
                      onChange={(e) => setPeriodDate(name, 'debut', e.target.value)}
                    />
                    <Input
                      label="Fin"
                      type="date"
                      value={periodeDates[name]?.fin ?? ''}
                      onChange={(e) => setPeriodDate(name, 'fin', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
            {dateErrors.length > 0 && (
              <p className="mt-2 text-[0.78rem] text-danger">{dateErrors[0]}</p>
            )}
          </div>

          {error && (
            <p className="text-[0.8125rem] text-danger">{error}</p>
          )}

          {/* Mid-year warning */}
          <div className="flex items-start gap-2 rounded-md bg-warning-bg/40 border border-warning/20 px-3 py-2.5">
            <Info className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
            <p className="text-[0.8125rem] text-warning leading-snug">
              Modifier ces paramètres en cours d'année peut affecter le calcul
              des bulletins déjà clôturés. Préférez les définir avant la rentrée.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={save}
              disabled={!isDirty || dateErrors.length > 0}
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
