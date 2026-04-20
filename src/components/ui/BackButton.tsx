/**
 * RT-SC · BackButton
 * Navigates back in history (or to a fallback if no history).
 */

import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

interface BackButtonProps {
  /** Where to go if there's no history to pop (default: '/welcome') */
  fallback?: string
  label?: string
  className?: string
}

export function BackButton({
  fallback = '/welcome',
  label = 'Retour',
  className,
}: BackButtonProps) {
  const navigate = useNavigate()

  function handleClick() {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(fallback, { replace: true })
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1.5 min-h-touch px-2 -ml-2 text-navy/75',
        'text-sm font-medium hover:text-navy hover:opacity-100 opacity-90',
        'transition-opacity duration-150',
        className
      )}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}
