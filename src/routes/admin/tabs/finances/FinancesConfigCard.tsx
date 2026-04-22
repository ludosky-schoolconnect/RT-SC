/**
 * RT-SC · Finances config card.
 *
 * Card sitting at the top of the Finances tab. Edits:
 *   - scolarité (FCFA)
 *   - frais annexes (FCFA)
 *   - gratuité filles 1er cycle (boolean)
 *   - gratuité filles 2nd cycle (boolean)
 *
 * Uses a "local draft" pattern: admin types freely, "Enregistrer"
 * button shows the delta and saves. Reduces chance of accidental
 * changes as the admin navigates.
 */

import { useEffect, useState } from 'react'
import { Save, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useToast } from '@/stores/toast'
import {
  useFinancesConfig,
  useUpdateFinancesConfig,
} from '@/hooks/useFinances'

export function FinancesConfigCard() {
  const { data: cfg } = useFinancesConfig()
  const updateMut = useUpdateFinancesConfig()
  const toast = useToast()

  // Local draft state — synced from cfg when it arrives / changes
  const [scolarite, setScolarite] = useState<string>('0')
  const [fraisAnnexes, setFraisAnnexes] = useState<string>('0')
  const [grat1er, setGrat1er] = useState(false)
  const [grat2nd, setGrat2nd] = useState(false)

  useEffect(() => {
    if (!cfg) return
    setScolarite(String(cfg.scolarite ?? 0))
    setFraisAnnexes(String(cfg.fraisAnnexes ?? 0))
    setGrat1er(!!cfg.gratuiteFilles1er)
    setGrat2nd(!!cfg.gratuiteFilles2nd)
  }, [cfg])

  const scolariteNum = Number(scolarite) || 0
  const fraisNum = Number(fraisAnnexes) || 0

  const dirty =
    !!cfg &&
    (scolariteNum !== cfg.scolarite ||
      fraisNum !== cfg.fraisAnnexes ||
      grat1er !== cfg.gratuiteFilles1er ||
      grat2nd !== cfg.gratuiteFilles2nd)

  async function save() {
    try {
      await updateMut.mutateAsync({
        scolarite: scolariteNum,
        fraisAnnexes: fraisNum,
        gratuiteFilles1er: grat1er,
        gratuiteFilles2nd: grat2nd,
      })
      toast.success('Configuration enregistrée.')
    } catch (err) {
      console.error('[FinancesConfig] save error:', err)
      toast.error("Échec de l'enregistrement.")
    }
  }

  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy/8 text-navy ring-1 ring-navy/20">
          <Wallet className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <h3 className="font-display text-[1rem] font-bold text-navy leading-tight">
            Configuration des frais
          </h3>
          <p className="text-[0.72rem] text-ink-500">
            Montants annuels applicables à chaque élève
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[0.78rem] font-semibold text-ink-700 mb-1">
            Scolarité (FCFA)
          </label>
          <Input
            type="number"
            inputMode="numeric"
            value={scolarite}
            onChange={(e) => setScolarite(e.target.value)}
            placeholder="Ex. 60000"
            min={0}
            step={1000}
          />
        </div>
        <div>
          <label className="block text-[0.78rem] font-semibold text-ink-700 mb-1">
            Frais annexes (FCFA)
          </label>
          <Input
            type="number"
            inputMode="numeric"
            value={fraisAnnexes}
            onChange={(e) => setFraisAnnexes(e.target.value)}
            placeholder="Ex. 5000"
            min={0}
            step={500}
          />
        </div>
      </div>

      <div className="rounded-md bg-info-bg/60 border border-info/20 p-3 mb-4">
        <p className="text-[0.78rem] font-semibold text-navy mb-3">
          Gratuité filles (subvention gouvernementale)
        </p>
        <div className="space-y-3">
          {/* 1er cycle toggle row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[0.875rem] text-ink-800 leading-snug">
                1er cycle (6ème – 3ème)
              </p>
              <p className="text-[0.75rem] text-ink-500 leading-snug mt-0.5">
                Les filles de 6ème à 3ème sont exemptées de scolarité.
              </p>
            </div>
            <ToggleSwitch
              checked={grat1er}
              onChange={setGrat1er}
              ariaLabel="Activer la gratuité filles pour le premier cycle"
            />
          </div>

          {/* 2nd cycle toggle row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[0.875rem] text-ink-800 leading-snug">
                2nd cycle (2nde – Tle)
              </p>
              <p className="text-[0.75rem] text-ink-500 leading-snug mt-0.5">
                Les filles de 2nde à Terminale sont exemptées de scolarité.
              </p>
            </div>
            <ToggleSwitch
              checked={grat2nd}
              onChange={setGrat2nd}
              ariaLabel="Activer la gratuité filles pour le second cycle"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={!dirty || updateMut.isPending}
          loading={updateMut.isPending}
          leadingIcon={<Save className="h-4 w-4" />}
        >
          {dirty ? 'Enregistrer' : 'À jour'}
        </Button>
      </div>
    </div>
  )
}
