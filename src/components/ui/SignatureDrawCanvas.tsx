/**
 * RT-SC · SignatureDrawCanvas
 *
 * Touch/mouse drawing canvas for signatures. 400×150 logical size, rendered
 * at 2× for retina (800×300 backing store). Exposes an imperative handle so
 * parent cards can:
 *   - toDataUrl()  → base64 PNG string (empty canvas returns '')
 *   - isEmpty()    → true if nothing has been drawn
 *   - clear()      → wipe the canvas + reset undo stack
 *
 * UX:
 *   - Tap / click & drag to draw.
 *   - "Annuler" (undo) removes the last continuous stroke.
 *   - "Effacer" (clear) wipes everything.
 *   - Placeholder text shows when empty.
 *
 * Why the undo stack is snapshot-based (not stroke-array replay):
 *   We capture getImageData() after each pointerup. Restoring is one
 *   putImageData() call — instant on Android without reconstructing paths.
 *   Cost: 800×300×4 bytes ≈ 1 MB per snapshot. Capped at 10 snapshots.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Undo2, Eraser } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SignatureDrawCanvasHandle {
  /** Returns base64-encoded PNG data URL, or empty string when nothing drawn. */
  toDataUrl: () => string
  /** True if the canvas has no strokes. */
  isEmpty: () => boolean
  /** Wipe the canvas and reset undo stack. */
  clear: () => void
}

interface SignatureDrawCanvasProps {
  /** Optional initial signature to render (base64 PNG data URL). */
  initialDataUrl?: string
  /** Fired on pointerup whenever the drawing state changes. */
  onChange?: (dataUrl: string) => void
  className?: string
  /** Disable drawing (e.g. while saving). */
  disabled?: boolean
}

const LOGICAL_WIDTH = 400
const LOGICAL_HEIGHT = 150
const DPR = 2
const MAX_UNDO = 10
const STROKE_COLOR = '#0B2545' // navy
const STROKE_WIDTH = 2.5

export const SignatureDrawCanvas = forwardRef<
  SignatureDrawCanvasHandle,
  SignatureDrawCanvasProps
>(function SignatureDrawCanvas(
  { initialDataUrl, onChange, className, disabled = false },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const undoStack = useRef<ImageData[]>([])
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  // ─ Setup canvas once on mount ─
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = LOGICAL_WIDTH * DPR
    canvas.height = LOGICAL_HEIGHT * DPR
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(DPR, DPR)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = STROKE_WIDTH
    ctx.strokeStyle = STROKE_COLOR
    ctxRef.current = ctx

    // If an initial signature was provided, paint it.
    if (initialDataUrl) {
      const img = new Image()
      img.onload = () => {
        ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
        ctx.drawImage(img, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
        setIsEmpty(false)
      }
      img.src = initialDataUrl
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─ Get pointer position in logical (CSS) coordinates ─
  const getPos = useCallback(
    (evt: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      // Scale from displayed size → logical coordinate space
      const scaleX = LOGICAL_WIDTH / rect.width
      const scaleY = LOGICAL_HEIGHT / rect.height
      return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY,
      }
    },
    []
  )

  // ─ Snapshot current canvas to undo stack ─
  const pushUndoSnapshot = useCallback(() => {
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    // Capture at device-pixel resolution to round-trip cleanly via putImageData
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
    undoStack.current.push(snap)
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
  }, [])

  // ─ Pointer handlers ─
  const handlePointerDown = useCallback(
    (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      if (disabled) return
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      if (!canvas || !ctx) return
      // Snapshot BEFORE this stroke so Annuler restores pre-stroke state
      pushUndoSnapshot()
      try {
        canvas.setPointerCapture(evt.pointerId)
      } catch {
        // Some environments reject setPointerCapture; safe to ignore.
      }
      drawingRef.current = true
      const pos = getPos(evt)
      lastPointRef.current = pos
      // Dot for simple taps (draw a tiny circle so a single click leaves a mark)
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, STROKE_WIDTH / 2, 0, Math.PI * 2)
      ctx.fillStyle = STROKE_COLOR
      ctx.fill()
    },
    [disabled, getPos, pushUndoSnapshot]
  )

  const handlePointerMove = useCallback(
    (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      const ctx = ctxRef.current
      const last = lastPointRef.current
      if (!ctx || !last) return
      const pos = getPos(evt)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      lastPointRef.current = pos
    },
    [getPos]
  )

  const handlePointerUp = useCallback(
    (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      drawingRef.current = false
      lastPointRef.current = null
      try {
        canvasRef.current?.releasePointerCapture(evt.pointerId)
      } catch {
        // ignore
      }
      setIsEmpty(false)
      if (onChange) {
        const canvas = canvasRef.current
        if (canvas) onChange(canvas.toDataURL('image/png'))
      }
    },
    [onChange]
  )

  // ─ Undo: pop last snapshot, paint it back ─
  const handleUndo = useCallback(() => {
    if (disabled) return
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    const snap = undoStack.current.pop()
    if (!snap) {
      // No snapshots → clear everything (defensive)
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
      setIsEmpty(true)
    } else {
      ctx.putImageData(snap, 0, 0)
      // If stack empty after pop AND restored snapshot itself is blank,
      // mark empty. We detect blank by checking the alpha channel of the
      // restored pixels — cheaper than re-reading imageData.
      if (undoStack.current.length === 0) {
        // The snapshot we just put back could still contain marks (e.g.
        // user drew once, then drew again, then undid — they still have
        // one stroke left). So we can't assume empty. Defer to a quick
        // scan of alpha values.
        const data = snap.data
        let hasInk = false
        for (let i = 3; i < data.length; i += 4 * 64) {
          // stride for speed
          if (data[i] > 0) {
            hasInk = true
            break
          }
        }
        setIsEmpty(!hasInk)
      }
    }
    if (onChange) {
      onChange(isEmptyCanvas(canvas) ? '' : canvas.toDataURL('image/png'))
    }
  }, [disabled, onChange])

  // ─ Clear: wipe canvas + undo stack ─
  const handleClear = useCallback(() => {
    if (disabled) return
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
    undoStack.current = []
    setIsEmpty(true)
    if (onChange) onChange('')
  }, [disabled, onChange])

  // ─ Imperative handle ─
  useImperativeHandle(
    ref,
    () => ({
      toDataUrl: () => {
        const canvas = canvasRef.current
        if (!canvas) return ''
        if (isEmptyCanvas(canvas)) return ''
        return canvas.toDataURL('image/png')
      },
      isEmpty: () => {
        const canvas = canvasRef.current
        if (!canvas) return true
        return isEmptyCanvas(canvas)
      },
      clear: handleClear,
    }),
    [handleClear]
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative rounded-md border-[1.5px] border-ink-200 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className={cn(
            'block w-full touch-none select-none',
            disabled && 'opacity-60 cursor-not-allowed'
          )}
          style={{ aspectRatio: `${LOGICAL_WIDTH} / ${LOGICAL_HEIGHT}` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="Zone de signature"
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-[0.8125rem] text-ink-400 italic">
              Signez ici avec votre doigt ou votre souris
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={disabled || undoStack.current.length === 0}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border-[1.5px] border-ink-100 bg-white px-3 py-1.5',
            'text-[0.8125rem] font-semibold text-ink-700 hover:border-navy hover:text-navy',
            'transition-colors duration-150 ease-out-soft',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-ink-100 disabled:hover:text-ink-700'
          )}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Annuler
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || isEmpty}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border-[1.5px] border-ink-100 bg-white px-3 py-1.5',
            'text-[0.8125rem] font-semibold text-ink-700 hover:border-danger hover:text-danger',
            'transition-colors duration-150 ease-out-soft',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-ink-100 disabled:hover:text-ink-700'
          )}
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden />
          Effacer
        </button>
      </div>
    </div>
  )
})

// ─── Helpers ────────────────────────────────────────────────

/** Scan canvas alpha channel to detect whether any pixel is inked. */
function isEmptyCanvas(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  const { width, height } = canvas
  if (width === 0 || height === 0) return true
  const data = ctx.getImageData(0, 0, width, height).data
  // Stride for speed — good enough for "is there any ink?"
  for (let i = 3; i < data.length; i += 4 * 32) {
    if (data[i] > 0) return false
  }
  return true
}
