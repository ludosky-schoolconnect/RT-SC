/**
 * RT-SC · User settings store.
 *
 * Client-side preferences that apply across all roles and persist to
 * localStorage. Keys live in a single namespaced object so we can
 * migrate the shape later without stomping unrelated keys.
 *
 * Currently live:
 *   - fontSize — accessibility (small / normal / large)
 *   - themeMode — light / dark / sepia / auto. The store and switcher
 *     are wired (the choice is saved + applied to the <html> element
 *     as data-theme), but the actual color palette migration to CSS
 *     variables is a separate, larger piece of work. Until that lands,
 *     swapping the theme will set the attribute but the visible UI
 *     stays in the existing palette. This unlocks the UX upfront so
 *     the rest of the migration can land without re-shipping the
 *     switcher.
 *
 * Removed: language (i18n deferred — Béninois clients are
 * French-speaking, browser auto-translate handles edge cases).
 *
 * Why Zustand, not React Context: settings changes should trigger
 * re-renders only where used. Zustand selectors keep this cheap.
 */

import { create } from 'zustand'

export type FontSize = 'small' | 'normal' | 'large'
export type ThemeMode = 'light' | 'dark' | 'sepia' | 'auto'

export interface UserSettings {
  fontSize: FontSize
  themeMode: ThemeMode
}

const DEFAULTS: UserSettings = {
  fontSize: 'normal',
  themeMode: 'light',
}

const STORAGE_KEY = 'rt-sc:user-settings:v1'

function load(): UserSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    // Shallow merge — guards against old keys / missing fields.
    // Note: legacy `language` field is silently dropped on next save.
    return {
      fontSize: parsed.fontSize ?? DEFAULTS.fontSize,
      themeMode: parsed.themeMode ?? DEFAULTS.themeMode,
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
  reset: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setFontSize: (fontSize) => {
    set({ fontSize })
    save({ ...get(), fontSize })
    applyFontSize(fontSize)
  },
  setThemeMode: (themeMode) => {
    set({ themeMode })
    save({ ...get(), themeMode })
    applyTheme(themeMode)
  },
  reset: () => {
    set(DEFAULTS)
    save(DEFAULTS)
    applyFontSize(DEFAULTS.fontSize)
    applyTheme(DEFAULTS.themeMode)
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

// ─── Theme application ──────────────────────────────────────

/**
 * Resolves 'auto' → the OS preference at call time. Pure function for
 * testability; the actual media-query subscription lives in initTheme().
 */
function resolveTheme(mode: ThemeMode): 'light' | 'dark' | 'sepia' {
  if (mode === 'auto') {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark'
    }
    return 'light'
  }
  return mode
}

/**
 * Writes the resolved theme to <html data-theme="...">. The CSS layer
 * (to be added in the theme-migration session) will read this attribute
 * to swap CSS variables and recolor the entire app. Until that lands,
 * setting the attribute is a no-op visually, but the choice persists
 * so the user doesn't have to re-pick after the migration ships.
 */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(mode)
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.setAttribute('data-theme-mode', mode)
}

/**
 * Boot-time theme initialisation. Call once from main.tsx after the
 * store is hydrated. Also subscribes to OS color-scheme changes when
 * the user has selected 'auto', so the app re-themes live.
 */
export function initTheme() {
  if (typeof window === 'undefined') return

  const current = useSettingsStore.getState().themeMode
  applyTheme(current)

  // Live-react to OS scheme changes ONLY when the user picked 'auto'
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    const mode = useSettingsStore.getState().themeMode
    if (mode === 'auto') applyTheme('auto')
  }
  mql.addEventListener?.('change', onChange)
}
