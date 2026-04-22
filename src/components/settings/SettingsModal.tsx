/**
 * RT-SC · Settings modal.
 *
 * User-facing preferences modal accessible from the header of every
 * authenticated dashboard (admin / prof / caissier / élève / parent).
 *
 * Live features:
 *   - Font size — small / normal / large. Applies a CSS root
 *     font-size so every rem-based size in the app scales.
 *
 * Theme switching and language switching have been intentionally
 * removed — the visible palette migration is a larger piece of work
 * not yet ready to ship, and Béninois clients don't need i18n.
 */

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from '@/components/ui/Modal'
import { Type, Info } from 'lucide-react'
import { useSettingsStore, type FontSize } from '@/stores/settings'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Préférences</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          {/* Font size */}
          <SettingGroup
            icon={<Type className="h-4 w-4" aria-hidden />}
            title="Taille du texte"
            description="Ajuste la lisibilité dans toute l'application."
          >
            <SegmentedControl<FontSize>
              value={fontSize}
              onChange={setFontSize}
              options={[
                { value: 'small', label: 'Petit' },
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Grand' },
              ]}
            />
            <FontPreview />
          </SettingGroup>

          {/* Footer info */}
          <div className="rounded-lg bg-info-bg/40 border border-navy/10 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
            <p className="text-[0.76rem] text-ink-700 leading-snug">
              Vos préférences sont enregistrées sur cet appareil et
              réappliquées à la prochaine connexion.
            </p>
          </div>
        </div>
      </ModalBody>
    </Modal>
  )
}

// ─── Setting group ──────────────────────────────────────────

function SettingGroup({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-start gap-2 mb-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-navy/10 text-navy ring-1 ring-navy/15 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[0.92rem] font-bold text-navy leading-tight">
            {title}
          </p>
          <p className="text-[0.76rem] text-ink-500 mt-0.5 leading-snug">
            {description}
          </p>
        </div>
      </div>
      <div className="pl-9">{children}</div>
    </div>
  )
}

// ─── Segmented control ──────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg bg-ink-100/60 p-1"
      role="radiogroup"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-[0.82rem] font-bold transition-all min-h-[38px]',
              active
                ? 'bg-white text-navy shadow-sm ring-1 ring-navy/10'
                : 'text-ink-600 hover:text-navy'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Font preview ───────────────────────────────────────────

function FontPreview() {
  return (
    <p className="mt-2.5 rounded-md bg-white border border-ink-100 px-3 py-2 text-ink-700">
      <span className="text-[0.82rem]">Aperçu · Un texte d'exemple.</span>
    </p>
  )
}
