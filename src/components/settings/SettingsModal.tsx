/**
 * RT-SC · Settings modal.
 *
 * User-facing preferences modal accessible from the header of every
 * authenticated dashboard (admin / prof / caissier / élève / parent).
 *
 * Live features:
 *   - Font size — small / normal / large. Applies a CSS root
 *     font-size so every rem-based size in the app scales.
 *   - Theme mode — light / dark / sepia / auto. The choice is stored
 *     and applied to <html data-theme="..."> so the rest of the app's
 *     CSS layer can pick it up. The visible recoloring lands in a
 *     follow-up migration; this modal already commits the user's
 *     choice so it sticks once the styles ship.
 */

import { useId } from 'react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from '@/components/ui/Modal'
import {
  Type,
  Palette,
  Sun,
  Moon,
  BookOpen,
  Monitor,
  Info,
} from 'lucide-react'
import {
  useSettingsStore,
  type FontSize,
  type ThemeMode,
} from '@/stores/settings'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <ModalTitle>Préférences</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-6">
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

          {/* Theme */}
          <SettingGroup
            icon={<Palette className="h-4 w-4" aria-hidden />}
            title="Thème"
            description="Apparence générale de l'application. La refonte visuelle complète est en cours — votre choix sera appliqué dès qu'elle sera disponible."
          >
            <ThemeChoiceGrid value={themeMode} onChange={setThemeMode} />
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
      <div className="flex items-start gap-2 mb-2.5">
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

// ─── Segmented control (font size) ──────────────────────────

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

// ─── Theme choice grid ──────────────────────────────────────
// Larger tiles — themes deserve a more visual picker than a
// segmented strip. Each tile shows its name + a tiny preview swatch.

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemeMode
  label: string
  description: string
  icon: React.ReactNode
  swatchClass: string
}> = [
  {
    value: 'light',
    label: 'Clair',
    description: 'Apparence par défaut',
    icon: <Sun className="h-4 w-4" aria-hidden />,
    swatchClass: 'bg-white border border-ink-200',
  },
  {
    value: 'dark',
    label: 'Sombre',
    description: 'Pour la nuit',
    icon: <Moon className="h-4 w-4" aria-hidden />,
    swatchClass: 'bg-navy-dark',
  },
  {
    value: 'sepia',
    label: 'Sépia',
    description: 'Lecture confortable',
    icon: <BookOpen className="h-4 w-4" aria-hidden />,
    swatchClass: 'bg-[#F4ECD8] border border-[#E5D8B8]',
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Selon le système',
    icon: <Monitor className="h-4 w-4" aria-hidden />,
    swatchClass: 'bg-gradient-to-br from-white to-navy-dark',
  },
]

function ThemeChoiceGrid({
  value,
  onChange,
}: {
  value: ThemeMode
  onChange: (v: ThemeMode) => void
}) {
  const groupId = useId()
  return (
    <div
      className="grid grid-cols-2 gap-2"
      role="radiogroup"
      aria-labelledby={groupId}
    >
      {THEME_OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40',
              active
                ? 'border-navy bg-navy/5 shadow-sm'
                : 'border-ink-200 bg-white hover:border-navy/40 hover:bg-ink-50/40'
            )}
          >
            {/* Swatch */}
            <div
              className={cn(
                'shrink-0 w-9 h-9 rounded-md ring-1 ring-ink-200/50 flex items-center justify-center',
                opt.swatchClass
              )}
              aria-hidden
            >
              <span
                className={cn(
                  'opacity-80',
                  opt.value === 'dark'
                    ? 'text-white'
                    : opt.value === 'sepia'
                      ? 'text-[#5C4A2C]'
                      : 'text-ink-600'
                )}
              >
                {opt.icon}
              </span>
            </div>
            {/* Label */}
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'font-bold text-[0.85rem] leading-tight',
                  active ? 'text-navy' : 'text-ink-700'
                )}
              >
                {opt.label}
              </p>
              <p className="text-[0.7rem] text-ink-500 leading-snug truncate">
                {opt.description}
              </p>
            </div>
            {/* Check indicator */}
            {active && (
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-navy"
              />
            )}
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
