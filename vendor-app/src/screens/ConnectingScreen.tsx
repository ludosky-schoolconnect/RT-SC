import { RefreshCw } from 'lucide-react'
import { useSession } from '@/lib/session'

export function ConnectingScreen() {
  const { phase } = useSession()
  if (phase.kind !== 'connecting') return null

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <RefreshCw
        className="h-8 w-8 text-navy animate-spin mb-4"
        aria-hidden
      />
      <p className="font-display text-lg font-semibold text-navy">
        Connexion à {phase.school.name}…
      </p>
      <p className="text-[0.8rem] text-ink-500 mt-1">
        Initialisation de Firebase
      </p>
    </div>
  )
}
