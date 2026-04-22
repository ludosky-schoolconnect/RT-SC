/**
 * RT-SC · Settings modal.
 *
 * User-facing preferences modal accessible from the header of every
 * authenticated dashboard (admin / prof / caissier / élève / parent).
 *
 * Live features (Phase 1):
 *   - Font size — small / normal / large. Applies a CSS root
 *     font-size so every rem-based size in the app scales.
 *
 * Coming-soon placeholders (Phase 2+):
 *   - Theme mode (light / dark / auto) — dark mode is deferred
 *   - Language (fr / en) — full i18n is deferred
 *
 * All preferences persist to localStorage via useSettingsStore.
 */

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from '@/components/ui/Modal'
import {
  Type,
  Palette,
  Languages,
  Info,
} from 'lucide-react'
import { useSettingsStore, type FontSize } from '@/stores/settings'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const language = useSettingsStore((s) => s.language)

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Préférences</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          {/* Font size (live) */}
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

          {/* Theme (coming soon) */}
          <SettingGroup
            icon={<Palette className="h-4 w-4" aria-hidden />}
            title="Thème"
            description="Choisir l'apparence claire ou sombre."
            comingSoon
          >
            <SegmentedControl
              value={themeMode}
              onChange={() => {}}
              disabled
              options={[
                { value: 'light', label: 'Clair' },
                { value: 'dark', label: 'Sombre' },
                { value: 'auto', label: 'Auto' },
              ]}
            />
          </SettingGroup>

          {/* Language (coming soon) */}
          <SettingGroup
            icon={<Languages className="h-4 w-4" aria-hidden />}
            title="Langue"
            description="Français / English."
            comingSoon
          >
            <SegmentedControl
              value={language}
              onChange={() => {}}
              disabled
              options={[
                { value: 'fr', label: 'Français' },
                { value: 'en', label: 'English' },
              ]}
            />
          </SettingGroup>

          {/* Footer info */}
          <div className="rounded-lg bg-info-bg/40 border border-navy/10 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-navy shrink-0 mt-0.5" aria-hidden />
            <p className="text-[0.76rem] text-ink-700 leading-snug">
              Vos préférences sont enregistrées sur cet appareil. Elles
              sont réappliquées à la prochaine connexion.
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
  comingSoon,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  comingSoon?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn(comingSoon && 'opacity-60')}>
      <div className="flex items-start gap-2 mb-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-navy/10 text-navy ring-1 ring-navy/15 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-display text-[0.92rem] font-bold text-navy leading-tight">
              {title}
            </p>
            {comingSoon && (
              <span className="inline-flex items-center rounded bg-ink-100 px-1.5 py-0.5 text-[0.62rem] font-bold text-ink-500 uppercase tracking-wider">
                Bientôt
              </span>
            )}
          </div>
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
  disabled?: boolean
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-ink-100/60 p-1',
        disabled && 'pointer-events-none'
      )}
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
            disabled={disabled}
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
