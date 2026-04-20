/**
 * RT-SC · classname helper.
 * Combines clsx + tailwind-merge so conflicting Tailwind classes resolve cleanly.
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
