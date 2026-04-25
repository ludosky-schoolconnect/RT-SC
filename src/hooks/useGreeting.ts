/**
 * RT-SC · Time-aware French greeting + formatted today's date.
 * Uses Bénin local time (Africa/Porto-Novo).
 */

import { useEffect, useState } from 'react'
import { serverNow } from '@/lib/serverTime'

const BENIN_TZ = 'Africa/Porto-Novo'

function computeGreeting(now: Date = serverNow()): string {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: BENIN_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(now)
  const h = parseInt(hourStr, 10) % 24

  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function formatToday(now: Date = serverNow()): string {
  // e.g. "Lundi 20 avril 2026"
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: BENIN_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(now)
    .replace(/^./, (c) => c.toUpperCase())
}

export function useGreeting(): { greeting: string; today: string } {
  const [state, setState] = useState(() => ({
    greeting: computeGreeting(),
    today: formatToday(),
  }))

  useEffect(() => {
    // Refresh once a minute so the greeting stays accurate over long sessions
    const t = setInterval(() => {
      setState({
        greeting: computeGreeting(),
        today: formatToday(),
      })
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  return state
}
