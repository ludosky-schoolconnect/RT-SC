/**
 * RT-SC · ConfirmDialog
 *
 * Mounted ONCE at the App root. Reads from the confirm store.
 * Components anywhere call `useConfirm()(opts).then(ok => ...)` to ask.
 *
 * Variants: info (navy), warning (amber), danger (red).
 */

import { TriangleAlert, Info, ShieldAlert } from 'lucide-react'
import { useConfirmStore } from '@/stores/confirm'
import { Modal, ModalBody, ModalFooter } from './Modal'
import { Button } from './Button'

const ICON_FOR = {
  info: { Icon: Info, className: 'text-navy bg-info-bg' },
  warning: { Icon: TriangleAlert, className: 'text-warning bg-warning-bg' },
  danger: { Icon: ShieldAlert, className: 'text-danger bg-danger-bg' },
}

const BUTTON_VARIANT_FOR = {
  info: 'primary',
  warning: 'primary',
  danger: 'danger',
} as const

export function ConfirmDialog() {
  const { open, title, message, confirmLabel, cancelLabel, variant, confirm, cancel } =
    useConfirmStore()

  const v = variant ?? 'info'
  const { Icon, className } = ICON_FOR[v]

  return (
    <Modal open={open} onClose={cancel} size="sm" disableOverlayClose>
      <ModalBody className="text-center pt-8">
        <div className="flex justify-center mb-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ${className}`}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </div>
        </div>
        <h2 className="font-display text-xl font-semibold text-navy mb-2">
          {title}
        </h2>
        <p className="text-sm text-ink-600 leading-relaxed">{message}</p>
      </ModalBody>
      <ModalFooter className="bg-white border-t-0 pt-2 pb-6 px-6 justify-center gap-2">
        <Button variant="secondary" onClick={cancel}>
          {cancelLabel}
        </Button>
        <Button variant={BUTTON_VARIANT_FOR[v]} onClick={confirm} autoFocus>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
