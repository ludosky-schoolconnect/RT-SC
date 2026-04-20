/**
 * RT-SC · SchoolConnect logo (animated SVG monogram).
 *
 * A custom mark: navy rounded-square base, gold "S" with a gold dot above
 * suggesting a graduation cap tassel. Subtle stroke-draw + breathe animation
 * on first appearance.
 */

import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface LogoProps {
  size?: number
  /** Animate stroke draw on mount */
  animate?: boolean
  className?: string
}

export function SchoolConnectLogo({
  size = 64,
  animate = true,
  className,
}: LogoProps) {
  return (
    <motion.div
      initial={animate ? { scale: 0.92, opacity: 0 } : false}
      animate={animate ? { scale: 1, opacity: 1 } : undefined}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn('relative inline-block', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="SchoolConnect"
        role="img"
      >
        {/* Navy rounded base with subtle gradient */}
        <defs>
          <linearGradient id="sc-base" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0F2D54" />
            <stop offset="100%" stopColor="#0B2545" />
          </linearGradient>
          <linearGradient id="sc-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8C97A" />
            <stop offset="100%" stopColor="#C9A84C" />
          </linearGradient>
        </defs>

        <rect width="64" height="64" rx="14" fill="url(#sc-base)" />

        {/* Subtle inner highlight */}
        <rect
          x="0.5"
          y="0.5"
          width="63"
          height="63"
          rx="13.5"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />

        {/* Tassel dot above */}
        <motion.circle
          cx="42"
          cy="14"
          r="3"
          fill="url(#sc-gold)"
          initial={animate ? { scale: 0, opacity: 0 } : false}
          animate={animate ? { scale: 1, opacity: 1 } : undefined}
          transition={{ delay: 0.7, duration: 0.4, type: 'spring', stiffness: 220 }}
        />

        {/* Stylized "S" path */}
        <motion.path
          d="M 44 22 Q 44 16 36 16 L 26 16 Q 18 16 18 24 Q 18 32 26 32 L 38 32 Q 46 32 46 40 Q 46 48 38 48 L 22 48 Q 16 48 16 42"
          stroke="url(#sc-gold)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          initial={animate ? { pathLength: 0, opacity: 0 } : false}
          animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
          transition={{ delay: 0.15, duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
        />

        {/* Tiny "C" hint at bottom right (suggests "Connect") */}
        <motion.path
          d="M 50 46 Q 50 52 44 52"
          stroke="rgba(232,201,122,0.6)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          initial={animate ? { pathLength: 0, opacity: 0 } : false}
          animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
          transition={{ delay: 1.0, duration: 0.5 }}
        />
      </svg>

      {/* Breathing pulse on the gold tassel */}
      {animate && (
        <motion.span
          className="absolute pointer-events-none"
          style={{
            left: '64.5%',
            top: '17.5%',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'rgba(232,201,122,0.5)',
            transform: 'translate(-50%, -50%)',
          }}
          animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
          transition={{
            duration: 2.6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1.4,
          }}
        />
      )}
    </motion.div>
  )
}
