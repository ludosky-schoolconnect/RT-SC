/**
 * RT-SC · User settings store.
 *
 * Client-side preferences that apply across all roles and persist to
 * localStorage. Keys live in a single namespaced object so we can
 * migrate the shape later without stomping unrelated keys.
 *
 * Currently live:
 *   - fontSize — accessibility (small / normal / large)
 *
 * Removed: theme (light/dark/sepia — visible palette migration is a
 * larger piece of work not ready to ship) and language (i18n deferred
 * — Béninois clients are French-speaking).
 *
 * Why Zustand, not React Context: settings changes should trigger
 * re-renders only where used. Zustand selectors keep this cheap.
 */

import { create } from 'zustand'

export type FontSize = 'small' | 'normal' | 'large'

export interface UserSettings {
  fontSize: FontSize
}

const DEFAULTS: UserSettings = {
  fontSize: 'normal',
}

const STORAGE_KEY = 'rt-sc:user-settings:v1'

function load(): UserSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    // Shallow merge — guards against old keys / missing fields.
    // Note: legacy `themeMode` and `language` fields are silently
    // dropped on next save.
    return {
      fontSize: parsed.fontSize ?? DEFAULTS.fontSize,
    }
  } catch {
    return DEFAULTS
  }
}

function save(settings: UserSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Out of quota or disabled storage — silent; session still works
  }
}

interface SettingsState extends UserSettings {
  setFontSize: (v: FontSize) => void
  reset: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setFontSize: (fontSize) => {
    set({ fontSize })
    save({ ...get(), fontSize })
    applyFontSize(fontSize)
  },
  reset: () => {
    set(DEFAULTS)
    save(DEFAULTS)
    applyFontSize(DEFAULTS.fontSize)
  },
}))

// ─── Font size application ──────────────────────────────────

export const FONT_SIZE_PX: Record<FontSize, number> = {
  small: 15,
  normal: 16,
  large: 18,
}

export function applyFontSize(size: FontSize) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(
    '--app-font-size',
    `${FONT_SIZE_PX[size]}px`
  )
  document.documentElement.setAttribute('data-font-size', size)
}
