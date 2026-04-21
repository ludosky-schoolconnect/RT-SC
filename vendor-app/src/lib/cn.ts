import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Compose class names with Tailwind conflict resolution.
 * Example: `cn('p-2 p-4', condition && 'p-6')` → `'p-6'`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
