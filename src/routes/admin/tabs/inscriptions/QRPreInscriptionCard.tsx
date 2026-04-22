/**
 * RT-SC · QR pré-inscription card.
 *
 * Admin-facing utility that generates a QR code linking to the
 * public pre-inscription form (`/inscription`). Shown on the admin
 * Inscriptions tab so the school can:
 *
 *   - Print a poster with the QR for the school gate / admin office
 *   - Paste the QR on the school's Facebook page / WhatsApp status
 *   - Share the raw URL directly for digital channels
 *
 * The QR encodes the current origin + the `/inscription` path, so
 * the URL adapts automatically to whatever domain the school is
 * deployed on (localhost during dev, custom domain in production).
 *
 * Library: `qrcode` (npm). Run `npm install qrcode` in the project
 * root if not yet installed. The package is ~40KB gzipped and works
 * fully offline — no external API calls.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { QrCode, Download, Copy, Check, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/stores/toast'
import { useEcoleConfig } from '@/hooks/useEcoleConfig'

export function QRPreInscriptionCard() {
  const { data: ecoleConfig } = useEcoleConfig()
  const toast = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // URL target — always the /inscription route on the current origin.
  // Derived from window.location so it works across dev/prod/tunneled
  // deploys without configuration. Shown verbatim below the QR so
  // admin can double-check before printing.
  const url = useMemo(() => {
    if (typeof window === 'undefined') return '/inscription'
    return `${window.location.origin}/inscription`
  }, [])

  const [copied, setCopied] = useState(false)
  const [renderKey, setRenderKey] = useState(0)

  // Render the QR into the canvas whenever the URL changes (or admin
  // hits "Régénérer"). Size is 256×256 for the on-screen preview.
  // Download path uses a fresh 512×512 render for print clarity.
  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 256,
        margin: 2,
        errorCorrectionLevel: 'H', // High — more resilient to printing artifacts
        color: {
          dark: '#11223F', // RT-SC navy
          light: '#FFFFFF',
        },
      },
      (err) => {
        if (err) console.error('[QRPreInscription] render failed:', err)
      }
    )
  }, [url, renderKey])

  async function handleDownload() {
    try {
      // High-resolution rendering for print. 1024×1024 gives crisp
      // QRs on posters without getting absurdly large as a PNG.
      const dataUrl = await QRCode.toDataURL(url, {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#11223F', light: '#FFFFFF' },
      })
      const a = document.createElement('a')
      a.href = dataUrl
      const filename = ecoleConfig?.nom
        ? `QR-pre-inscription-${ecoleConfig.nom.replace(/\s+/g, '-')}.png`
        : 'QR-pre-inscription.png'
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success('QR code téléchargé')
    } catch (err) {
      console.error('[QRPreInscription] download failed:', err)
      toast.error('Téléchargement impossible')
    }
  }

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Lien copié')
      setTimeout(() => setCopied(false), 1800)
    } catch (err) {
      console.error('[QRPreInscription] copy failed:', err)
      toast.error('Copie impossible')
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy/10 text-navy ring-1 ring-navy/15">
            <QrCode className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle>QR code pré-inscription</CardTitle>
            <CardDescription>
              Partagez ce QR sur vos affiches, WhatsApp ou la page
              Facebook de l'école. Les parents le scannent pour ouvrir
              directement le formulaire de demande.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="px-5 sm:px-6 pb-5 space-y-4">
        {/* QR preview */}
        <motion.div
          key={renderKey}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="mx-auto w-fit rounded-xl bg-white p-3 ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)]"
        >
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            className="block w-[220px] h-[220px] sm:w-[256px] sm:h-[256px]"
            aria-label="QR code de pré-inscription"
          />
        </motion.div>

        {/* URL readout */}
        <div className="rounded-lg bg-ink-50/60 border border-ink-100 px-3 py-2.5">
          <p className="text-[0.68rem] uppercase tracking-wider font-bold text-ink-500 mb-1">
            Lien direct
          </p>
          <p className="font-mono text-[0.8rem] text-navy break-all leading-snug">
            {url}
          </p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            variant="primary"
            onClick={handleDownload}
            leadingIcon={<Download className="h-4 w-4" aria-hidden />}
            className="w-full"
          >
            Télécharger (PNG)
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopyUrl}
            leadingIcon={
              copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )
            }
            className="w-full"
          >
            {copied ? 'Copié !' : 'Copier le lien'}
          </Button>
        </div>

        {/* Regenerate (useful if the canvas hasn't drawn yet) */}
        <button
          type="button"
          onClick={() => setRenderKey((k) => k + 1)}
          className="mx-auto block text-[0.72rem] text-ink-500 hover:text-navy inline-flex items-center gap-1 transition-colors"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Régénérer le QR
        </button>

        {/* Usage hints */}
        <div className="rounded-lg bg-info-bg/40 border border-navy/10 p-3 text-[0.78rem] text-ink-700 leading-relaxed space-y-1.5">
          <p>
            <strong className="text-navy">Conseils :</strong>
          </p>
          <ul className="list-disc list-inside space-y-0.5 marker:text-ink-400">
            <li>Imprimez en grand format (A4 minimum) pour un scan facile.</li>
            <li>Placez le QR près du portail ou au secrétariat.</li>
            <li>Le lien s'ouvre automatiquement sur le téléphone du parent.</li>
          </ul>
        </div>
      </div>
    </Card>
  )
}
