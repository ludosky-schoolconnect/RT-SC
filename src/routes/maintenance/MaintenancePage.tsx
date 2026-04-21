/**
 * RT-SC · MaintenancePage
 *
 * Shown to NON-ADMIN users (prof, caissier, élève, parent) when the
 * school's subscription is locked. We deliberately don't expose the
 * reason (subscription expired vs manual lock) — that's between the
 * admin and the SchoolConnect vendor. Teachers and students shouldn't
 * learn that their school owes money.
 *
 * The page offers only two actions:
 *   1. "Se déconnecter" — clears the session so they can try another
 *      account or just close the app
 *   2. Implicit: if the admin unlocks, SubscriptionGuard triggers a
 *      full page reload and everyone lands back in the app
 *
 * We also show a live "Vérifier à nouveau" tick — if the user waits
 * and the subscription gets unlocked from the admin side while they're
 * on this page, the SubscriptionGuard (running in parent) will
 * window.location.reload() and they'll fall through to the app
 * automatically. No manual action required. The button is belt-and-
 * suspenders for cases where the guard's onSnapshot drops.
 */

import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { Wrench, LogOut, RefreshCw } from 'lucide-react'
import { auth } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'
import { SchoolConnectLogo } from '@/components/ui/SchoolConnectLogo'

export default function MaintenancePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const reset = useAuthStore((s) => s.reset)
  const { data: ecoleConfig } = useEcoleConfig()

  async function handleLogout() {
    const ok = await confirm({
      title: 'Se déconnecter ?',
      message: 'Vous reviendrez à l\'écran de bienvenue.',
      confirmLabel: 'Se déconnecter',
      cancelLabel: 'Annuler',
      variant: 'warning',
    })
    if (!ok) return
    try {
      await signOut(auth)
    } catch {
      // ignore
    }
    reset()
    toast.info('Déconnexion réussie.')
    navigate('/welcome', { replace: true })
  }

  function handleRecheck() {
    window.location.reload()
  }

  return (
    <div className="min-h-dvh bg-off-white flex flex-col">
      {/* Minimal header */}
      <header className="bg-navy text-white">
        <div className="max-w-xl mx-auto px-4 h-[68px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <SchoolConnectLogo size={36} animate={false} />
            <div className="min-w-0">
              <p className="text-[0.65rem] uppercase tracking-[0.15em] text-white/45 leading-none">
                SchoolConnect
              </p>
              {ecoleConfig?.nom && (
                <p className="font-display text-[0.95rem] font-semibold leading-tight truncate mt-0.5">
                  {ecoleConfig.nom}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[0.8rem] hover:bg-white/[0.08] transition-colors min-h-touch"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Déconnexion
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-12">
        <div className="rounded-xl bg-white border-[1.5px] border-ink-100 overflow-hidden shadow-sm">
          <div className="bg-gradient-to-br from-info-bg to-white px-5 py-8 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-info-bg border border-navy/20 mb-4">
              <Wrench className="h-6 w-6 text-navy" aria-hidden />
            </div>
            <h1 className="font-display text-[1.5rem] font-bold text-navy leading-tight">
              Service temporairement suspendu
            </h1>
            <p className="text-[0.9rem] text-ink-600 mt-3 leading-relaxed max-w-sm mx-auto">
              L'accès à SchoolConnect pour votre établissement est
              momentanément indisponible. Veuillez contacter
              l'administration de votre école.
            </p>
          </div>

          <div className="px-5 py-5 border-t border-ink-100 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleRecheck}
              className="w-full flex items-center justify-center gap-2 rounded-md border border-navy/20 text-navy hover:bg-info-bg px-4 py-2.5 text-[0.85rem] font-semibold transition-colors min-h-touch"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Vérifier à nouveau
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 rounded-md text-ink-500 hover:bg-ink-50 px-4 py-2.5 text-[0.85rem] font-medium transition-colors min-h-touch"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Se déconnecter
            </button>
          </div>
        </div>

        <p className="text-[0.75rem] text-ink-400 text-center mt-5">
          L'accès sera rétabli automatiquement dès que possible.
        </p>
      </main>
    </div>
  )
}
