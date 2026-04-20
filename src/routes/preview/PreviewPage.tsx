/**
 * RT-SC · Preview page.
 * Visual smoke test for every Phase 1 UI component.
 * Tap through it on the phone to confirm the look & feel before Phase 2.
 *
 * Once Phase 2 begins, this route can stay around — it's useful as a
 * design-system reference. Or remove it; entirely up to you.
 */

import { useState } from 'react'
import {
  Trash2, Plus, Sparkles, GraduationCap, KeyRound, Wallet,
  TrendingUp, BookOpen, Trophy, ShieldCheck, Users,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Checkbox, Radio } from '@/components/ui/Checkbox'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton, SkeletonRow, SkeletonCard } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { BackButton } from '@/components/ui/BackButton'
import { Section, SectionHeader } from '@/components/layout/Section'

import { useToast } from '@/stores/toast'
import { useConfirm } from '@/stores/confirm'

// Sample data for the DataTable demo
type Student = { id: string; nom: string; genre: 'M' | 'F'; classe: string; moyenne: number }
const SAMPLE_STUDENTS: Student[] = [
  { id: '1', nom: 'AGBANGLA Marie', genre: 'F', classe: '3ème M1', moyenne: 14.25 },
  { id: '2', nom: 'DOSSA Jean', genre: 'M', classe: '3ème M1', moyenne: 11.80 },
  { id: '3', nom: 'HOUNKPE Léa', genre: 'F', classe: '3ème M1', moyenne: 17.10 },
  { id: '4', nom: 'KPADONOU Paul', genre: 'M', classe: '3ème M1', moyenne: 9.50 },
]

const STUDENT_COLUMNS: DataTableColumn<Student>[] = [
  { id: 'nom', header: 'Nom', cell: (r) => <span className="font-semibold text-navy">{r.nom}</span> },
  {
    id: 'genre',
    header: 'Genre',
    cell: (r) => (
      <Badge variant={r.genre === 'F' ? 'serie-a' : 'navy'} size="sm">
        {r.genre === 'F' ? 'Féminin' : 'Masculin'}
      </Badge>
    ),
  },
  { id: 'classe', header: 'Classe', cell: (r) => r.classe },
  {
    id: 'moy',
    header: 'Moy.',
    cell: (r) => (
      <span className={r.moyenne >= 10 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
        {r.moyenne.toFixed(2)}
      </span>
    ),
    className: 'text-right',
  },
]

const TAB_ITEMS: TabItem[] = [
  { id: 'classes', label: 'Classes', icon: <Users className="h-5 w-5" /> },
  { id: 'eleves', label: 'Élèves', icon: <GraduationCap className="h-5 w-5" /> },
  { id: 'notes', label: 'Notes', icon: <BookOpen className="h-5 w-5" /> },
  { id: 'finances', label: 'Finances', icon: <Wallet className="h-5 w-5" /> },
  { id: 'palmares', label: 'Palmarès', icon: <Trophy className="h-5 w-5" /> },
  { id: 'securite', label: 'Sécurité', icon: <ShieldCheck className="h-5 w-5" /> },
]

export default function PreviewPage() {
  const toast = useToast()
  const confirm = useConfirm()

  const [modalOpen, setModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('classes')
  const [agreed, setAgreed] = useState(false)
  const [genre, setGenre] = useState<'M' | 'F'>('M')

  async function askDanger() {
    const ok = await confirm({
      title: 'Supprimer cette classe ?',
      message: 'Tous les élèves de la classe seront archivés. Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    })
    if (ok) toast.success('Classe supprimée (démo).')
    else toast.info('Action annulée.')
  }

  async function askWarning() {
    const ok = await confirm({
      title: 'Clôturer la période ?',
      message: 'Les notes ne pourront plus être modifiées après clôture.',
      confirmLabel: 'Clôturer',
      variant: 'warning',
    })
    if (ok) toast.warning('Période clôturée.')
  }

  return (
    <div className="min-h-dvh bg-off-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-12">
        <header className="space-y-1">
          <BackButton fallback="/" label="Retour" />
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-400">
            RT-SC · Phase 1 · Composants
          </p>
          <h1 className="font-display text-3xl font-bold text-navy tracking-tight">
            Aperçu du système de design
          </h1>
          <p className="text-sm text-ink-600">
            Visualisation de tous les composants UI partagés. Touchez chaque élément
            pour vérifier les interactions.
          </p>
        </header>

        {/* Buttons */}
        <Section>
          <SectionHeader kicker="Action" title="Boutons" description="Quatre variantes, trois tailles, états chargement." />
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button>Primaire</Button>
              <Button variant="secondary">Secondaire</Button>
              <Button variant="danger" leadingIcon={<Trash2 className="h-4 w-4" />}>Supprimer</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button size="sm">Petit</Button>
              <Button size="md">Moyen</Button>
              <Button size="lg">Grand</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button loading>En cours…</Button>
              <Button disabled>Désactivé</Button>
              <Button leadingIcon={<Plus className="h-4 w-4" />}>Avec icône</Button>
            </div>
            <Button fullWidth>Pleine largeur</Button>
          </div>
        </Section>

        {/* Form fields */}
        <Section>
          <SectionHeader kicker="Formulaires" title="Champs de saisie" />
          <div className="space-y-4">
            <Input label="Nom complet" placeholder="Ex: DOSSA Jean" />
            <Input label="Email" type="email" placeholder="vous@exemple.bj" hint="Sera utilisé pour vous contacter." />
            <Input label="Code parent" placeholder="PRNT-XXXX-XXXX" error="Code introuvable." />
            <Input
              label="Téléphone"
              placeholder="2290111000000"
              leading={<span className="text-sm">📱</span>}
              hint="13 chiffres exactement."
            />
            <Textarea label="Annonce" placeholder="Texte de l'annonce…" />
            <Select label="Cycle" defaultValue="">
              <option value="">— Choisir —</option>
              <option value="premier">Premier cycle (6ème → 3ème)</option>
              <option value="second">Second cycle (2nde → Terminale)</option>
            </Select>
          </div>
        </Section>

        {/* Checkbox / Radio */}
        <Section>
          <SectionHeader kicker="Sélection" title="Cases & radios" />
          <div className="space-y-3">
            <Checkbox
              label="J'accepte les conditions d'utilisation"
              description="Vous serez redirigé vers la prochaine étape."
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <Checkbox label="Notification désactivée" disabled />
            <div className="space-y-2">
              <p className="text-[0.8125rem] font-semibold text-ink-800">Genre</p>
              <Radio name="genre" label="Masculin" checked={genre === 'M'} onChange={() => setGenre('M')} />
              <Radio name="genre" label="Féminin" checked={genre === 'F'} onChange={() => setGenre('F')} />
            </div>
          </div>
        </Section>

        {/* Search */}
        <Section>
          <SectionHeader kicker="Recherche" title="Champ de recherche" description="Debouncé 300ms." />
          <SearchInput placeholder="Rechercher un élève…" onSearch={(v) => v && toast.info(`Recherche: « ${v} »`)} />
        </Section>

        {/* Cards */}
        <Section>
          <SectionHeader kicker="Surfaces" title="Cartes" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Card accent interactive>
              <CardHeader>
                <div>
                  <CardTitle>3ème M1</CardTitle>
                  <CardDescription>32 élèves · Premier cycle</CardDescription>
                </div>
                <Badge variant="navy" size="sm">M1</Badge>
              </CardHeader>
              <p className="text-sm text-ink-600">Classe principale du cycle.</p>
              <CardFooter>
                <Button variant="ghost" size="sm">Voir</Button>
                <Button size="sm">Gérer</Button>
              </CardFooter>
            </Card>
            <Card accent interactive>
              <CardHeader>
                <div>
                  <CardTitle>Tle D2</CardTitle>
                  <CardDescription>28 élèves · Second cycle</CardDescription>
                </div>
                <Badge variant="serie-d" size="sm">Série D</Badge>
              </CardHeader>
              <p className="text-sm text-ink-600">Bac scientifique.</p>
              <CardFooter>
                <Button variant="ghost" size="sm">Voir</Button>
                <Button size="sm">Gérer</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        {/* Badges */}
        <Section>
          <SectionHeader kicker="Indicateurs" title="Badges" />
          <div className="flex flex-wrap gap-2">
            <Badge variant="navy">Premier cycle</Badge>
            <Badge variant="serie-a">Série A</Badge>
            <Badge variant="serie-b">Série B</Badge>
            <Badge variant="serie-c">Série C</Badge>
            <Badge variant="serie-d">Série D</Badge>
            <Badge variant="success" leadingIcon={<TrendingUp className="h-3 w-3" />}>Stable</Badge>
            <Badge variant="warning">Fragile</Badge>
            <Badge variant="danger">En danger</Badge>
            <Badge variant="gold" leadingIcon={<KeyRound className="h-3 w-3" />}>XX-1234</Badge>
            <Badge variant="info">Trimestre 2</Badge>
          </div>
        </Section>

        {/* Loading states */}
        <Section>
          <SectionHeader kicker="Chargement" title="Indicateurs de chargement" />
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" label="Chargement des données…" />
            </div>
            <Card padded={false}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </Card>
            <SkeletonCard />
          </div>
        </Section>

        {/* Empty */}
        <Section>
          <SectionHeader kicker="État vide" title="Empty state" />
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="Aucun élève trouvé"
            description="Essayez de modifier votre recherche ou ajoutez un nouvel élève."
            action={<Button leadingIcon={<Plus className="h-4 w-4" />}>Ajouter un élève</Button>}
          />
        </Section>

        {/* Tabs */}
        <Section>
          <SectionHeader kicker="Navigation" title="Onglets" description="L'indicateur doré coulisse en douceur entre les onglets." />
          <Tabs items={TAB_ITEMS} value={activeTab} onChange={setActiveTab} />
          <div className="mt-4 p-5 bg-white border border-ink-100 rounded-md">
            <p className="text-sm text-ink-600">
              Onglet actif : <span className="font-semibold text-navy">{activeTab}</span>
            </p>
          </div>
        </Section>

        {/* Data table */}
        <Section>
          <SectionHeader
            kicker="Tableau"
            title="Liste d'élèves"
            description="Tableau sur écran moyen+, vues en cartes sur mobile."
          />
          <DataTable
            columns={STUDENT_COLUMNS}
            rows={SAMPLE_STUDENTS}
            rowKey={(r) => r.id}
            mobileTitle={(r) => r.nom}
          />
        </Section>

        {/* Toasts + Confirms */}
        <Section>
          <SectionHeader kicker="Feedback" title="Toasts & Confirmations" />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => toast.info('Information générale.')}>Toast info</Button>
            <Button variant="secondary" onClick={() => toast.success('Enregistré avec succès.')}>Toast succès</Button>
            <Button variant="secondary" onClick={() => toast.warning('Attention, données incomplètes.')}>Toast avert.</Button>
            <Button variant="secondary" onClick={() => toast.error('Erreur réseau.')}>Toast erreur</Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="danger" onClick={askDanger}>Confirm danger</Button>
            <Button variant="primary" onClick={askWarning}>Confirm warning</Button>
          </div>
        </Section>

        {/* Modal */}
        <Section>
          <SectionHeader kicker="Modal" title="Fenêtre modale" />
          <Button onClick={() => setModalOpen(true)} leadingIcon={<Sparkles className="h-4 w-4" />}>
            Ouvrir le modal
          </Button>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
            <ModalHeader onClose={() => setModalOpen(false)}>
              <ModalTitle>Nouvelle classe</ModalTitle>
              <ModalDescription>
                Remplissez les informations de la classe à créer.
              </ModalDescription>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Select label="Cycle" defaultValue="">
                  <option value="">— Choisir —</option>
                  <option value="premier">Premier cycle</option>
                  <option value="second">Second cycle</option>
                </Select>
                <Input label="Niveau" placeholder="Ex: 3ème" />
                <Input label="Salle" placeholder="Ex: M1" />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Annuler</Button>
              <Button onClick={() => { setModalOpen(false); toast.success('Classe créée (démo).') }}>
                Créer
              </Button>
            </ModalFooter>
          </Modal>
        </Section>

        {/* Icon buttons */}
        <Section>
          <SectionHeader kicker="Boutons icônes" title="IconButton" />
          <div className="flex gap-2">
            <IconButton aria-label="Modifier"><Sparkles className="h-5 w-5" /></IconButton>
            <IconButton variant="subtle" aria-label="Détails"><BookOpen className="h-5 w-5" /></IconButton>
            <IconButton variant="danger" aria-label="Supprimer"><Trash2 className="h-5 w-5" /></IconButton>
          </div>
        </Section>

        <footer className="pt-6 text-center text-xs text-ink-400">
          RT-SC · Phase 1 — fin de l'aperçu.
        </footer>
      </div>
    </div>
  )
}
