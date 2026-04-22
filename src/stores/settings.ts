/**
 * RT-SC · User settings store.
 *
 * Client-side preferences that apply across all roles and persist
 * to localStorage. Keys live in a single namespaced object so we
 * can migrate the shape later without stomping unrelated keys.
 *
 * Currently live:
 *   - fontSize — accessibility (small / normal / large)
 *
 * Deferred (visible in the Settings UI but not functional yet):
 *   - themeMode — light / dark / auto (dark mode is deferred)
 *   - language — fr / en (i18n is deferred)
 *
 * Why Zustand, not React Context: settings changes should trigger
 * re-renders only where used. Zustand selectors keep this cheap.
 */

import { create } from 'zustand'

export type FontSize = 'small' | 'normal' | 'large'
export type ThemeMode = 'light' | 'dark' | 'auto'
export type Language = 'fr' | 'en'

export interface UserSettings {
  fontSize: FontSize
  themeMode: ThemeMode
  language: Language
}

const DEFAULTS: UserSettings = {
  fontSize: 'normal',
  themeMode: 'light',
  language: 'fr',
}

const STORAGE_KEY = 'rt-sc:user-settings:v1'

function load(): UserSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    // Shallow merge — guards against old keys / missing fields
    return {
      fontSize: parsed.fontSize ?? DEFAULTS.fontSize,
      themeMode: parsed.themeMode ?? DEFAULTS.themeMode,
      language: parsed.language ?? DEFAULTS.language,
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
  setThemeMode: (v: ThemeMode) => void
  setLanguage: (v: Language) => void
  reset: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setFontSize: (fontSize) => {
    set({ fontSize })
    save({ ...get(), fontSize })
  },
  setThemeMode: (themeMode) => {
    set({ themeMode })
    save({ ...get(), themeMode })
  },
  setLanguage: (language) => {
    set({ language })
    save({ ...get(), language })
  },
  reset: () => {
    set(DEFAULTS)
    save(DEFAULTS)
  },
}))

// ─── Font size application ──────────────────────────────────

/**
 * Applies the current font size to the document root by setting
 * a `data-font-size` attribute. Tailwind utility classes that read
 * this attribute can scale accordingly. The attribute approach
 * beats mutating the root font-size directly because it lets us
 * keep absolute sizes for things that shouldn't scale (tiny icons,
 * small metadata labels).
 *
 * For the global default, we set the HTML element's base font-size
 * via a CSS variable the app reads in base.css.
 */
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
