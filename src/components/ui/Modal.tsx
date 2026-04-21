/**
 * RT-SC · Modal
 *
 * Portal-rendered to #modal-root. Features:
 *   - Escape key closes
 *   - Overlay click closes (configurable)
 *   - Body scroll lock while open
 *   - Mobile back-button handling: pushes a history entry on open,
 *     listens for popstate to close (so back button closes modal
 *     instead of leaving the page)
 *   - Framer Motion enter/exit (scale + fade)
 *   - Focus trap inside modal (basic — restores focus on close)
 *
 * Sub-parts: ModalHeader, ModalBody, ModalFooter
 */

import {
  useEffect,
  useRef,
  type ReactNode,
  type HTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from './IconButton'
import {
  dismissibleStack,
  installGlobalListeners,
  uninstallGlobalListeners,
  type DismissibleEntry,
} from './dismissibleStack'

// Modal shares the global dismissible stack with useDismissibleLayer
// (dropdowns, bottom sheets). Only the topmost entry responds to
// Escape / back button. See dismissibleStack.ts for the invariants
// (400ms dead zone, no history.back() calls, etc.)

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

interface ModalProps {
  open: boolean
  onClose: () => void
  size?: ModalSize
  /** Disable closing when the overlay is clicked */
  disableOverlayClose?: boolean
  /** Disable closing on Escape key */
  disableEscClose?: boolean
  /** When true, mobile back button closes the modal instead of navigating */
  trapBackButton?: boolean
  className?: string
  children: ReactNode
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

export function Modal({
  open,
  onClose,
  size = 'md',
  disableOverlayClose = false,
  disableEscClose = false,
  trapBackButton = true,
  className,
  children,
}: ModalProps) {
  const modalRoot = useRef<HTMLElement | null>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  /**
   * Timestamp (ms) when the modal last transitioned to open.
   * Used to ignore overlay clicks that happen within ~300ms of opening,
   * which catches the lingering touch event from the open trigger before
   * AnimatePresence finishes mounting the overlay. Without this, opening
   * the modal with a tap can immediately close it on first try
   * (subsequent opens work fine because the cache + render is warm).
   */
  /**
   * Timestamp (ms) when the modal last transitioned to open. Used by the
   * overlay onClick to ignore clicks for ~300ms after opening — catches
   * the lingering touch event from the open trigger before the overlay
   * can be tapped intentionally.
   *
   * IMPORTANT: initialized to `open ? Date.now() : 0` so that when the
   * modal is mounted ALREADY open (a common pattern: parents do
   * `{state && <Modal open={true} />}` so the modal mounts and opens at
   * the same instant), the dead-zone is active from the very first
   * paint. Otherwise the useEffect below only stamps it AFTER first
   * commit, leaving a window where the lingering open-touch event can
   * close the modal before the dead-zone activates.
   */
  const openedAtRef = useRef<number>(open ? Date.now() : 0)

  if (!modalRoot.current && typeof document !== 'undefined') {
    modalRoot.current = document.getElementById('modal-root')
  }

  // Stamp openedAt every time `open` flips to true
  useEffect(() => {
    if (open) openedAtRef.current = Date.now()
  }, [open])

  /**
   * Latest-callback ref pattern — keeps `onClose` accessible from
   * stable handlers without putting it in dependency arrays.
   *
   * Why this matters: parent components that pass an inline arrow
   * (`onClose={() => setOpen(false)}`) create a fresh function on every
   * render. If we put `onClose` in the effect's deps, EVERY parent
   * re-render (every keystroke in an input, every mouse hover, every
   * setState elsewhere) would tear down the effect and re-run it. The
   * cleanup of the previous run would call `window.history.back()`,
   * which fires our own `popstate` listener, which calls `onClose`,
   * which closes the modal. That's why typing in a modal input was
   * silently closing the modal mid-input.
   */
  const onCloseRef = useRef(onClose)
  const disableEscCloseRef = useRef(disableEscClose)
  const trapBackButtonRef = useRef(trapBackButton)
  useEffect(() => {
    onCloseRef.current = onClose
    disableEscCloseRef.current = disableEscClose
    trapBackButtonRef.current = trapBackButton
  })

  // Body scroll lock + focus management + escape key + back button
  // CRITICAL: dep array is [open] only. Other props are read via refs
  // or are stable. See the latest-callback pattern note above.
  useEffect(() => {
    if (!open) return

    // Save the currently focused element so we can restore it on close
    lastFocusedRef.current = document.activeElement as HTMLElement | null

    // Lock body scroll while preserving scroll position. The naive
    // `overflow:hidden` approach can cause Android Chrome to "rescale"
    // the visual viewport when the layout viewport suddenly becomes
    // shorter than the visible area — this looks like a zoom on the
    // page underneath the modal. The position-fixed-with-top-offset
    // approach keeps the visual viewport stable.
    const originalScrollY = window.scrollY
    const originalBodyStyle = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
    }
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${originalScrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'

    // Escape key handling is done by the global keydown listener
    // installed on first modal/dismissible open (see dismissibleStack).
    // We just register this modal's close callback into the stack.

    // Back-button handling: push ONE synthetic history entry so the
    // browser's back gesture has something to consume before reaching
    // the real page. We never call history.back() ourselves.
    let pushedState = false
    if (trapBackButtonRef.current) {
      window.history.pushState({ rtScModal: true }, '')
      pushedState = true
    }

    // Register into the global dismissible stack. Only the topmost
    // entry responds to Escape / back button.
    const entry: DismissibleEntry = {
      respondToEscape: !disableEscCloseRef.current,
      respondToBack: trapBackButtonRef.current,
      openedAt: openedAtRef.current || Date.now(),
      close: () => onCloseRef.current(),
    }
    dismissibleStack.push(entry)
    installGlobalListeners()

    return () => {
      // Restore body styles AND scroll position together
      document.body.style.overflow = originalBodyStyle.overflow
      document.body.style.position = originalBodyStyle.position
      document.body.style.top = originalBodyStyle.top
      document.body.style.left = originalBodyStyle.left
      document.body.style.right = originalBodyStyle.right
      document.body.style.width = originalBodyStyle.width
      window.scrollTo(0, originalScrollY)

      // Pop this entry from the stack. Use indexOf in case the stack
      // drifted (nested modal closures / re-orders during dev hot-reload).
      const idx = dismissibleStack.indexOf(entry)
      if (idx >= 0) dismissibleStack.splice(idx, 1)
      uninstallGlobalListeners()

      // Deliberately do NOT call history.back() here. If the synthetic
      // state lingers, the next back tap will pop it — and if another
      // modal is still above us on the stack, the global popstate
      // handler will close it; if the stack is empty, it's a silent
      // no-op. See the long comment block at the top of the file.
      void pushedState // retained for future debugging

      // Restore focus
      lastFocusedRef.current?.focus?.()
    }
  }, [open])  // <-- ONLY open. Do not add other deps.

  if (!modalRoot.current) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm"
          onClick={(e) => {
            // Two layers of protection against the open-then-close flash:
            //
            // 1. Only close on direct overlay clicks, not events bubbling
            //    up from descendants (target===currentTarget guard).
            //
            // 2. Ignore overlay clicks within 300ms of opening — catches
            //    the lingering touch event from the open trigger that
            //    arrives at the freshly-mounted overlay before any user
            //    interaction can possibly have happened.
            if (e.target !== e.currentTarget) return
            if (Date.now() - openedAtRef.current < 400) return
            if (!disableOverlayClose) onClose()
          }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className={cn(
              'relative w-full rounded-lg bg-white shadow-xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden',
              SIZE_CLASSES[size],
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    modalRoot.current
  )
}

// ─── Sub-parts ──────────────────────────────────────────────

interface SubProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function ModalHeader({
  className,
  children,
  onClose,
  ...rest
}: SubProps & { onClose?: () => void }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 px-6 py-5 border-b border-ink-100',
        className
      )}
      {...rest}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && (
        <IconButton aria-label="Fermer" onClick={onClose} className="-mr-2 -mt-1">
          <X className="h-5 w-5" aria-hidden />
        </IconButton>
      )}
    </div>
  )
}

export function ModalTitle({ className, children, ...rest }: SubProps) {
  return (
    <h2
      className={cn(
        'font-display text-xl font-semibold text-navy tracking-tight',
        className
      )}
      {...rest}
    >
      {children}
    </h2>
  )
}

export function ModalDescription({ className, children, ...rest }: SubProps) {
  return (
    <p className={cn('mt-1 text-sm text-ink-600 leading-relaxed', className)} {...rest}>
      {children}
    </p>
  )
}

export function ModalBody({ className, children, ...rest }: SubProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function ModalFooter({ className, children, ...rest }: SubProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 px-6 py-4 border-t border-ink-100 bg-ink-50/40',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
