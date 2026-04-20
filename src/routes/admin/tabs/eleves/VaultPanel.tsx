/**
 * RT-SC · Vault codes panel.
 *
 * Collapsible section listing every élève's PIN and parent passkey,
 * with one-tap copy and per-élève regeneration.
 *
 * Closed by default — admin opens it only when distributing/sharing codes.
 *
 * Why the codes are visible to admins (and only to admins):
 *   - Élèves often forget their PIN
 *   - Parents lose their passkey
 *   - Admin needs to be able to look it up without involving Firebase Console
 *
 * The codes never leak — only an authenticated admin can fetch the élève
 * documents in the first place (Firestore rules).
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { Eleve } from '@/types/models'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'
import { useRegenerateEleveCodes } from '@/hooks/useElevesMutations'
import { exportToExcel, exportToCsv } from '@/lib/exporters'
import { cn } from '@/lib/cn'

interface VaultPanelProps {
  classeId: string
  classeName: string
  eleves: Eleve[]
}

export function VaultPanel({ classeId, classeName, eleves }: VaultPanelProps) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const regenMut = useRegenerateEleveCodes()

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copié.`)
    } catch {
      toast.error('Copie impossible. Vérifiez les permissions du navigateur.')
    }
  }

  async function regen(eleve: Eleve, what: 'pin' | 'parent' | 'both') {
    const labelMap = {
      pin: 'le PIN',
      parent: 'le code parent',
      both: 'les deux codes',
    }
    const ok = await confirm({
      title: `Régénérer ${labelMap[what]} ?`,
      message: `L'ancien code de ${eleve.nom} sera invalide. ${
        what === 'parent' || what === 'both'
          ? 'Le parent devra ressaisir le nouveau code lors de sa prochaine connexion.'
          : "L'élève devra utiliser le nouveau code lors de sa prochaine connexion."
      }`,
      confirmLabel: 'Régénérer',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const result = await regenMut.mutateAsync({
        classeId,
        eleveId: eleve.id,
        what,
      })
      if (result.codePin) toast.success(`Nouveau PIN : ${result.codePin}`)
      if (result.passkeyParent)
        toast.success(`Nouveau code parent : ${result.passkeyParent}`)
    } catch {
      toast.error('Échec de la régénération.')
    }
  }

  async function exportExcel() {
    if (eleves.length === 0) {
      toast.warning('Aucun élève à exporter.')
      return
    }
    try {
      await exportToExcel({
        filename: `coffre-codes-${classeName.replace(/\s+/g, '-')}`,
        sheets: [
          {
            name: 'Codes',
            columns: [
              { header: 'Nom', accessor: (e: Eleve) => e.nom, width: 30 },
              { header: 'Genre', accessor: (e: Eleve) => (e.genre === 'F' ? 'Féminin' : 'Masculin') },
              { header: 'PIN élève', accessor: (e: Eleve) => e.codePin, width: 14 },
              { header: 'Code parent', accessor: (e: Eleve) => e.passkeyParent, width: 18 },
            ],
            rows: eleves,
          },
        ],
      })
      toast.success('Fichier Excel téléchargé.')
    } catch {
      toast.error("Échec de l'export Excel.")
    }
  }

  function exportCsv() {
    if (eleves.length === 0) {
      toast.warning('Aucun élève à exporter.')
      return
    }
    exportToCsv({
      filename: `coffre-codes-${classeName.replace(/\s+/g, '-')}`,
      columns: [
        { header: 'Nom', accessor: (e: Eleve) => e.nom },
        { header: 'Genre', accessor: (e: Eleve) => (e.genre === 'F' ? 'Féminin' : 'Masculin') },
        { header: 'PIN élève', accessor: (e: Eleve) => e.codePin },
        { header: 'Code parent', accessor: (e: Eleve) => e.passkeyParent },
      ],
      rows: eleves,
    })
    toast.success('Fichier CSV téléchargé.')
  }

  return (
    <div className="rounded-lg border-[1.5px] border-ink-100 bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50 transition-colors min-h-touch"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold-pale border border-gold/30 text-warning">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 text-left">
            <p className="font-display text-[0.95rem] font-semibold text-navy leading-tight">
              Coffre des codes
            </p>
            <p className="text-[0.78rem] text-ink-400 leading-tight">
              {eleves.length === 0
                ? 'Aucun élève pour le moment.'
                : `${eleves.length} élève${eleves.length > 1 ? 's' : ''} · PIN + code parent`}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-ink-400 transition-transform shrink-0',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {eleves.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-ink-400 border-t border-ink-100">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden />
                Ajoutez d'abord des élèves pour générer leurs codes.
              </div>
            ) : (
              <>
                {/* Action row */}
                <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t border-ink-100 bg-ink-50/40">
                  <Button size="sm" variant="secondary" onClick={exportExcel}>
                    Exporter Excel
                  </Button>
                  <Button size="sm" variant="secondary" onClick={exportCsv}>
                    Exporter CSV
                  </Button>
                  <p className="text-[0.78rem] text-ink-400 ml-auto">
                    Conservez ce fichier en lieu sûr.
                  </p>
                </div>

                {/* Codes list */}
                <ul className="divide-y divide-ink-100">
                  {eleves.map((e) => (
                    <li key={e.id} className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 font-display font-bold text-sm"
                          aria-hidden
                        >
                          {e.nom.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-semibold text-navy truncate">{e.nom}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-11">
                        <CodeRow
                          icon={<KeyRound className="h-3 w-3" />}
                          label="PIN élève"
                          code={e.codePin}
                          onCopy={() => copy(e.codePin, 'PIN')}
                          onRegen={() => regen(e, 'pin')}
                        />
                        <CodeRow
                          icon={<Users className="h-3 w-3" />}
                          label="Code parent"
                          code={e.passkeyParent}
                          onCopy={() => copy(e.passkeyParent, 'Code parent')}
                          onRegen={() => regen(e, 'parent')}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface CodeRowProps {
  icon: React.ReactNode
  label: string
  code: string
  onCopy: () => void
  onRegen: () => void
}

function CodeRow({ icon, label, code, onCopy, onRegen }: CodeRowProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-ink-100 bg-ink-50/40 pl-3 pr-1 py-1.5">
      <div className="flex items-center gap-1.5 text-ink-400 shrink-0">
        <span aria-hidden>{icon}</span>
        <span className="text-[0.65rem] uppercase tracking-wider font-bold">
          {label}
        </span>
      </div>
      <code className="font-mono text-[0.8125rem] font-bold text-navy ml-1 tracking-wider truncate">
        {code}
      </code>
      <div className="flex items-center gap-0.5 ml-auto shrink-0">
        <IconButton
          aria-label={`Copier ${label}`}
          variant="ghost"
          className="h-8 w-8"
          onClick={onCopy}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </IconButton>
        <IconButton
          aria-label={`Régénérer ${label}`}
          variant="ghost"
          className="h-8 w-8"
          onClick={onRegen}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </IconButton>
      </div>
    </div>
  )
}
