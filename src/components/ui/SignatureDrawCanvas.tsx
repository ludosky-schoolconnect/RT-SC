/**
 * RT-SC · SignatureDrawCanvas (Session 4 reliability rewrite).
 *
 * Touch/mouse drawing canvas for signatures. Public API and output
 * shape unchanged (data URL PNG via `toDataUrl()` on the imperative
 * handle). Internal implementation rewritten to fix three bugs:
 *
 *   1. "Drawing cuts or doesn't render" — old code locked the backing
 *      buffer at 800×300 on mount while CSS width was whatever the
 *      container gave, producing scaleX/scaleY math that shifted
 *      strokes when the CSS width didn't match the fixed buffer.
 *   2. "Rotate phone and strokes skew" — no resize handling.
 *   3. "Draw during collapsible animation" — canvas mounted with near-
 *      zero height; scaleY blew up during the height: 0 → auto animation.
 *
 * Fixes:
 *   A. Use `evt.nativeEvent.offsetX/offsetY` — target-space coordinates,
 *      no scaling math, works regardless of layout state.
 *   B. ResizeObserver-driven buffer resize. Capture current pixels as
 *      a data URL before resize; resize buffer to match CSS × DPR;
 *      repaint from the data URL.
 *   C. `isReady` gate. Pointer events are ignored until a non-trivial
 *      size has been observed. A "Préparation…" placeholder shows
 *      meanwhile.
 *
 * Context state (stroke style, lineCap/Join, transform) is re-applied
 * after every buffer resize — resizing a canvas silently resets its 2D
 * context. That's the classic trap handled in `applyContextState()`.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Undo2, Eraser } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SignatureDrawCanvasHandle {
  /** Base64-encoded PNG data URL, or '' if the canvas is empty. */
  toDataUrl: () => string
  /** True if nothing has been drawn. */
  isEmpty: () => boolean
  /** Wipe the canvas and reset undo stack. */
  clear: () => void
}

interface SignatureDrawCanvasProps {
  /** Optional initial signature (base64 PNG data URL) painted on mount. */
  initialDataUrl?: string
  /** Fired on pointerup after any drawing state change. */
  onChange?: (dataUrl: string) => void
  className?: string
  /** Disable drawing (e.g. while the parent card is saving). */
  disabled?: boolean
}

// DPR clamped to a sane maximum — some Android browsers report 3+
// which quadruples memory for marginal visual gain.
const DPR = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
const MAX_UNDO = 10
const STROKE_COLOR = '#0B2545' // navy
const STROKE_WIDTH = 2.5

/** Minimum CSS dimensions below which we refuse to treat the canvas
 *  as "ready" — avoids degenerate strokes during mount animations. */
const MIN_READY_W = 100
const MIN_READY_H = 50

/** Target aspect ratio for the canvas surface. Matches the 400:150
 *  ratio historically used so saved PNGs read back at the same shape. */
const ASPECT_RATIO = 400 / 150

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
  const initialDataUrlRef = useRef<string | undefined>(initialDataUrl)

  const [isEmpty, setIsEmpty] = useState(!initialDataUrl)
  const [isReady, setIsReady] = useState(false)

  // Let the parent swap in a new signature without remounting.
  useEffect(() => {
    initialDataUrlRef.current = initialDataUrl
  }, [initialDataUrl])

  /** Re-apply stroke style after any context reset. Resizing the
   *  backing buffer implicitly resets the transform + all style state,
   *  so this MUST be called after every canvas.width/height assignment. */
  const applyContextState = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = STROKE_WIDTH
    ctx.strokeStyle = STROKE_COLOR
    ctx.fillStyle = STROKE_COLOR
  }, [])

  /**
   * Resize the backing buffer to match the element's CSS size,
   * preserving drawn content. Called on mount and on every resize event.
   */
  const resizeBuffer = useCallback((): boolean => {
    const canvas = canvasRef.current
    if (!canvas) return false
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (cssW < MIN_READY_W || cssH < MIN_READY_H) return false

    // Snapshot the current visual as a data URL — survives the resize
    // regardless of how the buffer dimensions change. ImageData would
    // not: it's pixel-dimension specific.
    let preservedUrl: string | null = null
    try {
      if (!isEmptyCanvas(canvas)) {
        preservedUrl = canvas.toDataURL('image/png')
      }
    } catch {
      // ignore — nothing to preserve
    }

    const targetW = Math.round(cssW * DPR)
    const targetH = Math.round(cssH * DPR)
    // Only reallocate when dimensions actually changed — ResizeObserver
    // fires frequently and buffer realloc is heavy.
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctxRef.current = ctx
    applyContextState(ctx)

    if (preservedUrl) {
      const img = new Image()
      img.onload = () => {
        ctx.clearRect(0, 0, cssW, cssH)
        ctx.drawImage(img, 0, 0, cssW, cssH)
      }
      img.src = preservedUrl
    }
    return true
  }, [applyContextState])

  /** Paint `initialDataUrl` onto the canvas after the first successful
   *  resize (so we know the buffer has real dimensions). */
  const paintInitial = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    const src = initialDataUrlRef.current
    if (!canvas || !ctx || !src) return
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, cssW, cssH)
      ctx.drawImage(img, 0, 0, cssW, cssH)
      setIsEmpty(false)
    }
    img.src = src
  }, [])

  // ─── ResizeObserver setup ─────────────────────────────────
  // useLayoutEffect to run before paint — otherwise an unscaled frame
  // briefly flashes.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let didInitialPaint = false

    const onResize = () => {
      const sized = resizeBuffer()
      if (!sized) return
      if (!didInitialPaint) {
        didInitialPaint = true
        paintInitial()
      }
      setIsReady(true)
    }

    // Initial synchronous attempt — most often layout is already settled.
    onResize()

    // Observe for later resizes (rotation, collapsible open/close,
    // parent modal reflow).
    const observer = new ResizeObserver(onResize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [resizeBuffer, paintInitial])

  // ─── Pointer handlers — use offsetX/offsetY, no rect math ─

  const pushUndoSnapshot = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    try {
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
      undoStack.current.push(snap)
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    } catch {
      // getImageData can throw in rare states; worst case, undo
      // misses this stroke. Safe to swallow.
    }
  }, [])

  const handlePointerDown = useCallback(
    (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      if (disabled || !isReady) return
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      if (!canvas || !ctx) return
      pushUndoSnapshot()
      try {
        canvas.setPointerCapture(evt.pointerId)
      } catch {
        // not all envs support pointer capture
      }
      drawingRef.current = true
      const x = evt.nativeEvent.offsetX
      const y = evt.nativeEvent.offsetY
      // Tap dot so single taps leave a mark.
      ctx.beginPath()
      ctx.arc(x, y, STROKE_WIDTH / 2, 0, Math.PI * 2)
      ctx.fill()
      // Open a fresh path for continuous strokes.
      ctx.beginPath()
      ctx.moveTo(x, y)
    },
    [disabled, isReady, pushUndoSnapshot]
  )

  const handlePointerMove = useCallback(
    (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      const ctx = ctxRef.current
      if (!ctx) return
      const x = evt.nativeEvent.offsetX
      const y = evt.nativeEvent.offsetY
      ctx.lineTo(x, y)
      ctx.stroke()
    },
    []
  )

  const handlePointerUp = useCallback(
    (evt: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      drawingRef.current = false
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

  // ─── Undo / Clear ────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (disabled) return
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    const snap = undoStack.current.pop()
    if (!snap) {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      setIsEmpty(true)
    } else {
      try {
        // putImageData is in device-pixel space. Its dimensions must
        // match the current buffer — safe because we capture after
        // resize, not before.
        ctx.putImageData(snap, 0, 0)
      } catch {
        // If something drifted, fall back to full clear.
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      }
      setIsEmpty(isEmptyCanvas(canvas))
    }
    if (onChange) {
      onChange(isEmptyCanvas(canvas) ? '' : canvas.toDataURL('image/png'))
    }
  }, [disabled, onChange])

  const handleClear = useCallback(() => {
    if (disabled) return
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    undoStack.current = []
    setIsEmpty(true)
    if (onChange) onChange('')
  }, [disabled, onChange])

  // ─── Imperative handle ───────────────────────────────────

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
          style={{ aspectRatio: ASPECT_RATIO }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="Zone de signature"
        />
        {!isReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-50/40">
            <p className="text-[0.78rem] text-ink-400 italic">Préparation…</p>
          </div>
        )}
        {isReady && isEmpty && (
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
          disabled={disabled || !isReady || undoStack.current.length === 0}
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
          disabled={disabled || !isReady || isEmpty}
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

/** Scan the canvas alpha channel to detect whether any pixel is inked. */
function isEmptyCanvas(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  const { width, height } = canvas
  if (width === 0 || height === 0) return true
  try {
    const data = ctx.getImageData(0, 0, width, height).data
    // Stride for speed — "is there any ink?" need not scan every pixel.
    for (let i = 3; i < data.length; i += 4 * 32) {
      if (data[i] > 0) return false
    }
    return true
  } catch {
    return true
  }
}
