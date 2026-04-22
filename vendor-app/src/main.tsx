/**
 * Vendor · Entry point.
 *
 * Wraps the app in SessionProvider which owns the phase state machine,
 * then renders the current screen based on phase kind. No router
 * needed — the vendor tool is a linear 4-screen flow.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { SessionProvider, useSession } from '@/lib/session'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { SchoolSelector } from '@/screens/SchoolSelector'
import { LoginScreen } from '@/screens/LoginScreen'
import { ConnectingScreen } from '@/screens/ConnectingScreen'
import { CommandCenter } from '@/screens/CommandCenter'
import { HubCommandCenter } from '@/screens/HubCommandCenter'
import { BootstrapScreen } from '@/screens/BootstrapScreen'
import { LogOut, ArrowLeftRight } from 'lucide-react'
import './styles.css'

function App() {
  return (
    <SessionProvider>
      <AppRouter />
    </SessionProvider>
  )
}

function AppRouter() {
  const { phase } = useSession()

  // Subtitle + right-slot action adapt based on phase
  const { subtitle, rightSlot } = useHeaderContext()

  // When active, switch between school/hub command centers based on
  // the saved role on the connected entry. Defaults to 'school' for
  // backward compat with entries saved before the role field existed.
  const isHubActive =
    phase.kind === 'active' && phase.school.role === 'hub'

  return (
    <AppShell subtitle={subtitle} rightSlot={rightSlot}>
      {phase.kind === 'idle' && <SchoolSelector />}
      {phase.kind === 'connecting' && <ConnectingScreen />}
      {phase.kind === 'auth' && <LoginScreen />}
      {phase.kind === 'bootstrap' && <BootstrapScreen />}
      {phase.kind === 'active' && !isHubActive && <CommandCenter />}
      {phase.kind === 'active' && isHubActive && <HubCommandCenter />}
    </AppShell>
  )
}

function useHeaderContext() {
  const { phase, logoutKeepSchool, switchSchool } = useSession()

  if (phase.kind === 'active') {
    return {
      subtitle: phase.school.name,
      rightSlot: (
        <>
          <Button
            variant="ghost"
            icon={<ArrowLeftRight />}
            onClick={switchSchool}
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <span className="hidden sm:inline">Changer d'école</span>
          </Button>
          <Button
            variant="ghost"
            icon={<LogOut />}
            onClick={logoutKeepSchool}
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <span className="hidden sm:inline">Déconnexion</span>
          </Button>
        </>
      ),
    }
  }

  if (phase.kind === 'auth') {
    return {
      subtitle: 'Authentification',
      rightSlot: null,
    }
  }

  if (phase.kind === 'bootstrap') {
    return {
      subtitle: 'Initialisation',
      rightSlot: (
        <Button
          variant="ghost"
          icon={<ArrowLeftRight />}
          onClick={switchSchool}
          className="text-white/80 hover:text-white hover:bg-white/10"
        >
          <span className="hidden sm:inline">Annuler</span>
        </Button>
      ),
    }
  }

  if (phase.kind === 'connecting') {
    return {
      subtitle: 'Connexion…',
      rightSlot: null,
    }
  }

  return { subtitle: 'Command Center', rightSlot: null }
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)
