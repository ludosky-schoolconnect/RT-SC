/**
 * RT-SC · PWA install prompt capture.
 *
 * `beforeinstallprompt` fires very early — sometimes before React mounts.
 * This module registers the listener the instant it is imported (top of
 * main.tsx, before any async work) so the event is never missed regardless
 * of how long the time-API sync takes.
 *
 * PwaInstallBanner reads the captured prompt via getInstallPrompt() on
 * mount and continues listening for future firings via its own useEffect.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let _deferred: BeforeInstallPromptEvent | null = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  _deferred = e as BeforeInstallPromptEvent
})

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return _deferred
}

export function clearInstallPrompt(): void {
  _deferred = null
}
