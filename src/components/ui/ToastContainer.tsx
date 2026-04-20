/**
 * RT-SC · ToastContainer
 *
 * Mounted ONCE at the App root. Reads from the toast store and renders
 * stacked toasts with slide-in/out animations.
 *
 * Components anywhere call `useToast().success(...)` etc. to enqueue toasts.
 */

import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useToastStore, type ToastItem, type ToastType } from '@/stores/toast'
import { cn } from '@/lib/cn'

const ICON_FOR: Record<ToastType, typeof CircleCheck> = {
  info: Info,
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
}

const STYLES_FOR: Record<ToastType, string> = {
  info: 'bg-info-bg text-navy border-navy/20',
  success: 'bg-success-bg text-success border-success/30',
  error: 'bg-danger-bg text-danger border-danger/30',
  warning: 'bg-warning-bg text-warning border-warning/30',
}

function Toast({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const Icon = ICON_FOR[item.type]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={cn(
        'pointer-events-auto flex items-start gap-3 min-w-[260px] max-w-sm rounded-md border-[1.5px] shadow-md px-4 py-3',
        STYLES_FOR[item.type]
      )}
      role="status"
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
      <p className="flex-1 text-sm font-medium leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Fermer la notification"
        className="-mr-1 -mt-1 h-6 w-6 inline-flex items-center justify-center rounded text-current opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </motion.div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const portalRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    portalRef.current = document.getElementById('toast-root')
  }, [])

  if (!portalRef.current) return null

  return createPortal(
    <div className="pointer-events-none fixed top-4 right-4 z-[2000] flex flex-col gap-2 items-end">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <Toast key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>,
    portalRef.current
  )
}
