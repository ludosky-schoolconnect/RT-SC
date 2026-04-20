/**
 * RT-SC · Toast store.
 *
 * Components push toasts via `useToast().push(...)`.
 * The <ToastContainer /> mounted at root listens and renders them.
 */

import { create } from 'zustand'

export type ToastType = 'info' | 'success' | 'error' | 'warning'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, type?: ToastType, duration?: number) => string
  dismiss: (id: string) => void
  clear: () => void
}

let counter = 0
const nextId = () => `t${Date.now()}_${counter++}`

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  push: (message, type = 'info', duration = 3500) => {
    const id = nextId()
    const item: ToastItem = { id, message, type, duration }
    set((s) => ({ toasts: [...s.toasts, item] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
    return id
  },

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}))

/** Convenience hook with bound action shortcuts */
export const useToast = () => {
  const push = useToastStore((s) => s.push)
  return {
    info: (msg: string, duration?: number) => push(msg, 'info', duration),
    success: (msg: string, duration?: number) => push(msg, 'success', duration),
    error: (msg: string, duration?: number) => push(msg, 'error', duration),
    warning: (msg: string, duration?: number) => push(msg, 'warning', duration),
    push,
    dismiss: useToastStore((s) => s.dismiss),
  }
}
