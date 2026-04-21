/**
 * RT-SC · Export dropdown — Archive + Appels du jour.
 *
 * "Exporter" button opens a small menu with CSV / PDF options.
 *
 * Placement is viewport-aware: the menu measures the button's position
 * on open and flips to the opposite side if the default alignment
 * would overflow. Also sizes width to min(14rem, available).
 *
 * Uses `position: fixed` + computed coordinates rather than absolute
 * positioning — that way it can escape any ancestor `overflow: hidden`
 * container (e.g. the sticky date header in the Archive view would
 * clip an `absolute` dropdown).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useDismissibleLayer } from './useDismissibleLayer'
import { cn } from '@/lib/cn'

interface Props {
  disabled?: boolean
  countLabel?: string
  onCsv: () => void
  onPdf: () => void
}

interface MenuPos {
  top: number
  left: number
  width: number
}

const MENU_MIN_WIDTH = 224 // 14rem
const MENU_MARGIN = 8      // breathing room against viewport edges

export function ExportMenu({ disabled, countLabel, onCsv, onPdf }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<MenuPos | null>(null)

  // Android back button + Escape close the menu (not navigate away).
  useDismissibleLayer({ open, onClose: () => setOpen(false) })

  // Compute placement whenever we open, and re-compute on window resize
  // while open. We read viewport width directly to decide whether
  // right-align or left-align has more room.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return

    function compute() {
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Prefer right-align (menu right edge == button right edge).
      // If that would push the left edge off-screen, left-align.
      const desiredWidth = Math.min(MENU_MIN_WIDTH, vw - MENU_MARGIN * 2)
      let left = rect.right - desiredWidth
      if (left < MENU_MARGIN) {
        // Not enough room on the left → align to button's LEFT edge
        left = rect.left
        // Still clip to viewport in case the button itself is near edge
        if (left + desiredWidth > vw - MENU_MARGIN) {
          left = vw - MENU_MARGIN - desiredWidth
        }
      }

      // Vertical: below the button by 8px. If not enough room below,
      // flip above.
      let top = rect.bottom + 8
      const menuGuessHeight = 120 // approx; we don't know exact yet
      if (top + menuGuessHeight > vh - MENU_MARGIN && rect.top - 8 > menuGuessHeight) {
        top = Math.max(MENU_MARGIN, rect.top - 8 - menuGuessHeight)
      }

      setPos({ top, left, width: desiredWidth })
    }

    compute()
    const onResize = () => compute()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true) // scroll in any scroll container
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open])

  // Click outside + Escape
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[0.82rem] font-semibold ring-1 transition-colors',
          disabled
            ? 'bg-ink-50 text-ink-400 ring-ink-200 cursor-not-allowed'
            : 'bg-white text-navy ring-navy/30 hover:bg-navy hover:text-white hover:ring-navy'
        )}
      >
        <Download className="h-4 w-4" aria-hidden />
        <span>Exporter</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {open && !disabled && pos && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 50,
          }}
          className="rounded-md bg-white shadow-xl ring-1 ring-ink-100 overflow-hidden"
        >
          {countLabel && (
            <div className="px-3 py-2 text-[0.7rem] text-ink-500 bg-ink-50/60 border-b border-ink-100">
              {countLabel}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onCsv()
            }}
            className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-[0.85rem] text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4 text-success shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">CSV (Excel)</div>
              <div className="text-[0.7rem] text-ink-500">
                Tableur — réutilisable, importable
              </div>
            </div>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onPdf()
            }}
            className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-[0.85rem] text-ink-700 hover:bg-ink-50 transition-colors border-t border-ink-100"
          >
            <FileText className="h-4 w-4 text-danger shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">PDF</div>
              <div className="text-[0.7rem] text-ink-500">
                Imprimable, rapport formel
              </div>
            </div>
          </button>
        </div>
      )}
    </>
  )
}
