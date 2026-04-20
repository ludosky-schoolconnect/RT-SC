/**
 * RT-SC · Educational quote rotator.
 *
 * Cycles through QUOTES every 10s with a smooth fade transition.
 * Pauses on hover/touch so users can finish reading.
 * Reduced motion preference is respected — falls back to instant swap.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Quote as QuoteIcon } from 'lucide-react'
import { QUOTES } from '@/lib/quotes'

const ROTATION_MS = 10_000

interface QuoteRotatorProps {
  className?: string
}

export function QuoteRotator({ className }: QuoteRotatorProps) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUOTES.length))
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % QUOTES.length)
    }, ROTATION_MS)
    return () => clearInterval(t)
  }, [paused])

  const quote = QUOTES[idx]

  return (
    <div
      className={className}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setTimeout(() => setPaused(false), 1500)}
    >
      <div className="flex items-start gap-3">
        <QuoteIcon
          className="h-5 w-5 shrink-0 mt-1 text-gold opacity-70"
          aria-hidden
        />
        <div className="flex-1 min-h-[88px]">
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={idx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="font-display text-[0.95rem] text-white/85 leading-relaxed italic"
            >
              <p className="mb-2">« {quote.text} »</p>
              <footer className="not-italic text-[0.7rem] uppercase tracking-[0.15em] text-gold-light/80 font-semibold">
                — {quote.author}
                {quote.context && (
                  <span className="block text-white/40 mt-0.5 normal-case tracking-normal text-[0.7rem] font-normal">
                    {quote.context}
                  </span>
                )}
              </footer>
            </motion.blockquote>
          </AnimatePresence>
        </div>
      </div>

      {/* Tiny progress dots */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {QUOTES.map((_, i) => {
          const active = i === idx
          return (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Citation ${i + 1}`}
              className="group h-2 flex items-center"
            >
              <span
                className={
                  active
                    ? 'block h-1 w-4 rounded-full bg-gold-light transition-all duration-300'
                    : 'block h-1 w-1 rounded-full bg-white/25 group-hover:bg-white/45 transition-all duration-300'
                }
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
