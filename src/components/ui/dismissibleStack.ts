/**
 * RT-SC · Global dismissible stack.
 *
 * Shared LIFO of Modal + dropdown/sheet dismissible layers. The
 * topmost entry wins the Escape key or back-button event.
 *
 * Exported for use by Modal and useDismissibleLayer. Components outside
 * those two shouldn't touch this directly — register via one of them.
 *
 * IMPORTANT — same invariants as the old Modal-internal stack:
 *   - Push on open, pop on close/unmount.
 *   - Only the topmost entry responds to Escape or popstate.
 *   - Never call history.back() ourselves (combined with StrictMode
 *     and React Router this can compound into multi-step navigation;
 *     we just let synthetic entries linger harmlessly until the next
 *     back tap consumes them).
 *   - 400ms dead zone after open to absorb stray Android popstate
 *     events fired during layout transitions (soft keyboard show,
 *     browser chrome show/hide, etc.)
 */

export interface DismissibleEntry {
  respondToEscape: boolean
  respondToBack: boolean
  close: () => void
  openedAt: number
}

export const dismissibleStack: DismissibleEntry[] = []
let globalListenersInstalled = false

export function installGlobalListeners() {
  if (globalListenersInstalled) return
  globalListenersInstalled = true
  window.addEventListener('keydown', onGlobalKeyDown)
  window.addEventListener('popstate', onGlobalPopState)
}

export function uninstallGlobalListeners() {
  if (!globalListenersInstalled) return
  if (dismissibleStack.length > 0) return
  globalListenersInstalled = false
  window.removeEventListener('keydown', onGlobalKeyDown)
  window.removeEventListener('popstate', onGlobalPopState)
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  const top = dismissibleStack[dismissibleStack.length - 1]
  if (!top || !top.respondToEscape) return
  const tag = (document.activeElement?.tagName ?? '').toLowerCase()
  const editable =
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (document.activeElement as HTMLElement | null)?.isContentEditable
  if (editable) return
  e.preventDefault()
  top.close()
}

function onGlobalPopState() {
  const top = dismissibleStack[dismissibleStack.length - 1]
  if (!top || !top.respondToBack) return
  if (Date.now() - top.openedAt < 400) return
  top.close()
}
