/**
 * RT-SC · useDismissibleLayer.
 *
 * Registers a dismissible UI layer (dropdown, popover, sheet) into the
 * same global Escape / back-button stack that the Modal component uses.
 *
 * Background: the `Modal` component already manages a LIFO stack so
 * the topmost dismissible thing responds to Escape / Android back
 * button / browser back navigation. But Modal is a heavy component
 * (portal, focus trap, body-scroll lock, backdrop). Lightweight
 * layers like menu dropdowns and bottom sheets don't need all that
 * ceremony — they just need their back-button / escape key handling
 * to cooperate with any real modals that might be on top.
 *
 * This hook does the minimum:
 *   1. On open: push a synthetic history entry (so back has something
 *      to pop) and register a stack entry.
 *   2. On close / unmount: remove the stack entry. Do NOT call
 *      history.back() ourselves — if the synthetic state lingers, the
 *      next back tap is either absorbed by the next layer on the
 *      stack, or is a silent no-op. Same policy as Modal.
 *
 * Usage:
 *
 *   const [open, setOpen] = useState(false)
 *   useDismissibleLayer({ open, onClose: () => setOpen(false) })
 *
 *   {open && <div>...your sheet or dropdown...</div>}
 *
 * Optional:
 *   - trapBackButton (default true) — set false if the layer should
 *     NOT intercept the hardware back button (rare; for layers that
 *     genuinely don't want to block navigation).
 *   - respondToEscape (default true) — set false to keep Esc from
 *     closing the layer.
 */

import { useEffect, useRef } from 'react'
import { dismissibleStack, installGlobalListeners, uninstallGlobalListeners } from './dismissibleStack'

interface UseDismissibleLayerOptions {
  open: boolean
  onClose: () => void
  trapBackButton?: boolean
  respondToEscape?: boolean
}

export function useDismissibleLayer({
  open,
  onClose,
  trapBackButton = true,
  respondToEscape = true,
}: UseDismissibleLayerOptions) {
  // Latest-callback ref so inline arrow `onClose` doesn't re-run this
  // effect on every parent render. Same pattern as Modal.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    if (trapBackButton) {
      window.history.pushState({ rtScDismissible: true }, '')
    }

    const entry = {
      respondToEscape,
      respondToBack: trapBackButton,
      openedAt: Date.now(),
      close: () => onCloseRef.current(),
    }
    dismissibleStack.push(entry)
    installGlobalListeners()

    return () => {
      const idx = dismissibleStack.indexOf(entry)
      if (idx >= 0) dismissibleStack.splice(idx, 1)
      uninstallGlobalListeners()
    }
  }, [open, trapBackButton, respondToEscape])
}
