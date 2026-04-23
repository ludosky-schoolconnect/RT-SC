/**
 * RT-SC · FedaPay SDK loader.
 *
 * Loads https://checkout.fedapay.com/js/checkout.js on demand, returns
 * a Promise that resolves to the `window.FedaPay` object once ready.
 *
 * Why dynamic and not a <script> tag in index.html: the FedaPay script
 * is only needed on the LockedPage + Mon abonnement card. Loading it
 * globally would bloat every page's initial bundle with a third-party
 * dependency we rarely need. Dynamic load ensures zero cost for the
 * 99% of sessions where the school isn't paying.
 *
 * Idempotent — if called multiple times (e.g. LockedPage re-render,
 * two tabs open, user clicks button twice), only the first call
 * actually injects the script. Later calls share the same Promise.
 */

const FEDAPAY_SRC = 'https://checkout.fedapay.com/js/checkout.js'

// Module-level cache. Once the SDK loads, this resolves forever.
// If the first load fails (network error), we clear this so the
// next call retries.
let loaderPromise: Promise<FedaPaySDK> | null = null

// ─── FedaPay widget surface (hand-written type) ───────────────────
//
// FedaPay doesn't ship TypeScript types on their CDN. We type the
// surface WE use — if we need more fields later, add them here.

export interface FedaPayTransaction {
  amount: number
  description: string
  /** Optional customer prefill */
  customer?: {
    firstname?: string
    lastname?: string
    email?: string
    phone_number?: { number: string; country: string }
  }
  /**
   * Session E5 — optional transaction metadata.
   *
   * FedaPay passes this through to the webhook payload untouched,
   * letting us tag each transaction with info the webhook server
   * needs to route correctly. We use it to embed the originating
   * school's Firebase project ID so the fedapayWebhook Cloud
   * Function can filter events by school (one FedaPay account
   * serves all schools → every webhook fires on every payment →
   * metadata filtering prevents cross-school deadline writes).
   *
   * Keys are free-form strings. Values should be string-ish since
   * FedaPay stringifies them on the wire.
   */
  custom_metadata?: Record<string, string | number | boolean | null>
}

/**
 * What FedaPay returns to `onComplete`. The real response is loosely
 * typed by their SDK; we capture the fields we actually check. Extra
 * fields are allowed (index signature catches anything else).
 */
export interface FedaPayCompleteResponse {
  reason?: string
  status?: string
  transaction?: {
    status?: string
    id?: number | string
    amount?: number
  }
  // Forward-compatible: anything else they return passes through
  [key: string]: unknown
}

export interface FedaPayInitOptions {
  public_key: string
  environment: 'live' | 'sandbox'
  transaction: FedaPayTransaction
  onComplete: (resp: FedaPayCompleteResponse) => void | Promise<void>
  /** Rarely used but supported — runs on widget close without payment */
  onClose?: () => void
}

export interface FedaPayWidget {
  open: () => void
  close?: () => void
}

export interface FedaPaySDK {
  init: (opts: FedaPayInitOptions) => FedaPayWidget
}

/**
 * Load the FedaPay SDK. Safe to call many times — returns the same
 * Promise after the first call succeeds.
 */
export function loadFedaPay(): Promise<FedaPaySDK> {
  if (loaderPromise) return loaderPromise

  loaderPromise = new Promise<FedaPaySDK>((resolve, reject) => {
    // Already loaded in a previous session? (rare — e.g. back/forward
    // cache). Check the global.
    if (typeof window !== 'undefined' && (window as unknown as { FedaPay?: FedaPaySDK }).FedaPay) {
      resolve((window as unknown as { FedaPay: FedaPaySDK }).FedaPay)
      return
    }

    // Script already injected by a concurrent call? Re-use it.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${FEDAPAY_SRC}"]`
    )
    if (existing) {
      existing.addEventListener('load', () => {
        const sdk = (window as unknown as { FedaPay?: FedaPaySDK }).FedaPay
        if (sdk) resolve(sdk)
        else reject(new Error('FedaPay loaded but global FedaPay is undefined'))
      })
      existing.addEventListener('error', () => {
        reject(new Error('FedaPay script failed to load'))
      })
      return
    }

    const script = document.createElement('script')
    script.src = FEDAPAY_SRC
    script.async = true
    script.onload = () => {
      const sdk = (window as unknown as { FedaPay?: FedaPaySDK }).FedaPay
      if (sdk) resolve(sdk)
      else reject(new Error('FedaPay loaded but global FedaPay is undefined'))
    }
    script.onerror = () => {
      // Clear the cache so retries work
      loaderPromise = null
      reject(new Error('Impossible de charger FedaPay — vérifiez votre connexion'))
    }
    document.head.appendChild(script)
  })

  return loaderPromise
}

/**
 * Detect environment from the public key itself. Live keys contain
 * "live" (e.g. `pk_live_...`), sandbox keys contain "sandbox". This
 * matches the legacy paiement.js convention exactly.
 */
export function detectFedaPayEnvironment(publicKey: string): 'live' | 'sandbox' {
  return publicKey.includes('live') ? 'live' : 'sandbox'
}

/**
 * Determine if a FedaPay onComplete response represents a successful
 * payment. FedaPay returns several possible shapes for approved
 * transactions depending on channel (card vs mobile money vs …);
 * we check all known success markers.
 *
 * Matches legacy paiement.js line 34 logic exactly.
 */
export function isFedaPayApproved(resp: FedaPayCompleteResponse): boolean {
  if (resp.status === 'approved' || resp.status === 'successful') return true
  if (resp.transaction?.status === 'approved') return true
  if (
    resp.reason &&
    String(resp.reason).toLowerCase().includes('success')
  ) {
    return true
  }
  return false
}
