/**
 * RT-SC · Modal des codes parents (PP only).
 *
 * Shows all élèves of the PP's class with their parent passkey
 * (PRNT-XXXX-XXXX) so the PP can hand codes out to families when
 * meeting them. Copy-to-clipboard per row. Read-only — regeneration
 * stays in admin's hands (VaultPanel).
 */

import { useMemo, useState } from 'react'
import { Copy, Search, ShieldCheck } from 'lucide-react'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useEleves } from '@/hooks/useEleves'
import { useToast } from '@/stores/toast'

interface Props {
  open: boolean
  onClose: () => void
  classeId: string
  classeName: string
}

export function ModalParentCodes({ open, onClose, classeId, classeName }: Props) {
  const { data: eleves = [], isLoading } = useEleves(classeId)
  const toast = useToast()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...eleves].sort((a, b) =>
      a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
    )
    if (!q) return sorted
    return sorted.filter((e) => e.nom.toLowerCase().includes(q))
  }, [eleves, search])

  async function copy(code: string, label: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(`${label} copié.`)
    } catch {
      toast.error('Impossible de copier.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-dark ring-1 ring-gold/30">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <ModalTitle>Codes d'accès</ModalTitle>
            <ModalDescription>
              {classeName} · PIN élève + code parent. Distribuez-les lors des
              rencontres.
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : eleves.length === 0 ? (
          <EmptyState
            title="Aucun élève"
            description="Cette classe n'a pas encore d'élèves inscrits."
          />
        ) : (
          <>
            <Input
              placeholder="Rechercher un élève…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leading={<Search className="h-4 w-4" />}
            />

            <div className="rounded-lg ring-1 ring-ink-100 divide-y divide-ink-100 overflow-hidden bg-white">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-[0.8125rem] text-ink-500">
                  Aucun résultat.
                </div>
              ) : (
                filtered.map((e, i) => (
                  <div key={e.id} className="px-3 py-3 hover:bg-ink-50/40">
                    <div className="flex items-start gap-3">
                      <div className="w-6 pt-0.5 text-[0.7rem] font-bold text-ink-400 tabular-nums shrink-0 text-right">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-[0.875rem] text-navy font-bold truncate">
                          {e.nom}
                        </p>
                        <p className="text-[0.7rem] text-ink-400 mt-0.5">
                          {e.genre === 'Masculin' ? 'M' : 'F'}
                          {e.contactParent ? ` · ${e.contactParent}` : ''}
                        </p>

                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <CodeChip
                            label="PIN élève"
                            code={e.codePin}
                            onClick={() => copy(e.codePin, 'PIN élève')}
                          />
                          <CodeChip
                            label="Code parent"
                            code={e.passkeyParent}
                            onClick={() => copy(e.passkeyParent, 'Code parent')}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <p className="text-[0.7rem] text-ink-400 italic px-1 leading-snug">
              Le <strong>PIN élève</strong> sert à la connexion dans l'espace
              élève. Le <strong>code parent</strong> donne accès à l'espace
              parent. En cas de perte ou de compromission, demandez à
              l'administration de régénérer le code concerné.
            </p>
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Per-code chip ──────────────────────────────────────────

function CodeChip({
  label,
  code,
  onClick,
}: {
  label: string
  code: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-ink-50 hover:bg-gold/10 ring-1 ring-ink-100 hover:ring-gold/40 transition-all !min-h-0 !min-w-0 text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[0.55rem] uppercase tracking-[0.15em] font-bold text-ink-400 leading-none mb-0.5">
          {label}
        </p>
        <p className="font-mono text-[0.78rem] font-bold text-navy tracking-tight truncate">
          {code}
        </p>
      </div>
      <Copy
        className="h-3 w-3 text-ink-400 group-hover:text-gold-dark shrink-0"
        aria-hidden
      />
    </button>
  )
}
