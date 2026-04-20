/**
 * RT-SC · Confirm dialog store.
 *
 * Replaces window.confirm and the legacy `customConfirm` overlays.
 * Components call `askConfirm({...})`. The <ConfirmDialog /> mounted at root
 * listens and renders the modal.
 */

import { create } from 'zustand'

export type ConfirmVariant = 'danger' | 'warning' | 'info'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((value: boolean) => void) | null
  ask: (opts: ConfirmOptions) => Promise<boolean>
  confirm: () => void
  cancel: () => void
  close: () => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmer',
  cancelLabel: 'Annuler',
  variant: 'info',
  resolve: null,

  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirmer',
        cancelLabel: opts.cancelLabel ?? 'Annuler',
        variant: opts.variant ?? 'info',
        resolve,
      })
    }),

  confirm: () => {
    const r = get().resolve
    set({ open: false, resolve: null })
    if (r) r(true)
  },

  cancel: () => {
    const r = get().resolve
    set({ open: false, resolve: null })
    if (r) r(false)
  },

  close: () => {
    const r = get().resolve
    set({ open: false, resolve: null })
    if (r) r(false)
  },
}))

/** Convenience hook returning just the `ask` function */
export const useConfirm = () => useConfirmStore((s) => s.ask)
