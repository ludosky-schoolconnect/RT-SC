/**
 * Vendor · Screen — Bootstrap.
 *
 * Fresh-school setup form. Shown when the vendor picks the "Initialiser
 * une nouvelle école" action on the selector. Runs after `connectToSchool`
 * has succeeded, so we have `firebase.db` + `firebase.auth` available
 * for writing.
 *
 * What it does:
 *   1. Pre-checks whether the target Firebase project is ALREADY
 *      bootstrapped (has /ecole/config). If yes, warn and refuse.
 *   2. Collects all the fields needed to seed the school.
 *   3. Calls bootstrapSchool() which creates the admin Auth user +
 *      batch-writes all seed docs.
 *   4. Hands off to the Command Center via completeBootstrap(user).
 *
 * Design:
 *   - Grouped sections (identité, admin, finances, abonnement, passkeys)
 *     so the form isn't one giant wall.
 *   - Pre-filled defaults for Bénin: trimester config, FCFA,
 *     current academic year, auto-generated passkeys.
 *   - Submit is disabled until all required fields are filled.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, School, User as UserIcon, Banknote, ShieldCheck, Calendar, Info } from 'lucide-react'
import { useSession } from '@/lib/session'
import {
  bootstrapSchool,
  isAlreadyBootstrapped,
  suggestDefaults,
  type BootstrapInput,
} from '@/lib/bootstrap'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { SectionCard } from '@/ui/SectionCard'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'

type Status =
  | { kind: 'checking' }
  | { kind: 'already' }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }

export function BootstrapScreen() {
  const { phase, switchSchool, completeBootstrap } = useSession()

  if (phase.kind !== 'bootstrap') return null
  const { firebase, school } = phase

  const [status, setStatus] = useState<Status>({ kind: 'checking' })
  const defaults = useMemo(
    () => suggestDefaults(school.name),
    [school.name]
  )

  // Form state
  const [schoolName, setSchoolName] = useState(defaults.schoolName ?? '')
  const [ville, setVille] = useState(defaults.ville ?? '')
  const [devise, setDevise] = useState(defaults.devise ?? 'F')
  const [adresse, setAdresse] = useState(defaults.adresse ?? '')
  const [telephone, setTelephone] = useState(defaults.telephone ?? '')
  const [anneeActive, setAnneeActive] = useState(defaults.anneeActive ?? '')

  const [adminNom, setAdminNom] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const [scolarite, setScolarite] = useState(String(defaults.scolarite ?? 60000))
  const [fraisAnnexes, setFraisAnnexes] = useState(String(defaults.fraisAnnexes ?? 10000))
  const [gratuiteFilles1er, setGratuiteFilles1er] = useState(
    defaults.gratuiteFilles1er ?? false
  )
  const [gratuiteFilles2nd, setGratuiteFilles2nd] = useState(
    defaults.gratuiteFilles2nd ?? false
  )

  const [passkeyProf, setPasskeyProf] = useState(defaults.passkeyProf ?? '')
  const [passkeyCaisse, setPasskeyCaisse] = useState(defaults.passkeyCaisse ?? '')

  const [subscriptionDays, setSubscriptionDays] = useState(
    String(defaults.subscriptionDays ?? 30)
  )
  const [subscriptionPrice, setSubscriptionPrice] = useState(
    String(defaults.subscriptionPrice ?? 15000)
  )
  const [subscriptionDurationMonths, setSubscriptionDurationMonths] = useState(
    String(defaults.subscriptionDurationMonths ?? 1)
  )
  const [fedaPayPublicKey, setFedaPayPublicKey] = useState('')
  const [supportWhatsAppNumber, setSupportWhatsAppNumber] = useState(
    defaults.supportWhatsAppNumber ?? ''
  )

  // Pre-check on mount: is this Firebase project already initialized?
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const already = await isAlreadyBootstrapped(firebase.db)
        if (cancelled) return
        setStatus(already ? { kind: 'already' } : { kind: 'ready' })
      } catch (err) {
        if (cancelled) return
        setStatus({
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Vérification impossible — regardez la console.',
        })
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [firebase.db])

  // Form-level validation. Note: status.kind narrowing is intentionally
  // omitted here so the disabled-while-submitting check in the button
  // can be evaluated independently without TS narrowing collisions.
  const canSubmit =
    schoolName.trim().length >= 2 &&
    anneeActive.trim().length >= 4 &&
    adminNom.trim().length >= 2 &&
    adminEmail.includes('@') &&
    adminPassword.length >= 6 &&
    /^\d{6}$/.test(passkeyProf) &&
    (passkeyCaisse === '' || /^\d{6}$/.test(passkeyCaisse))

  async function handleSubmit() {
    if (!canSubmit) return
    setStatus({ kind: 'submitting' })
    const input: BootstrapInput = {
      schoolName: schoolName.trim(),
      ville: ville.trim(),
      devise: devise.trim() || 'F',
      adresse: adresse.trim(),
      telephone: telephone.replace(/\D/g, ''),
      anneeActive: anneeActive.trim(),
      adminNom: adminNom.trim(),
      adminEmail: adminEmail.trim(),
      adminPassword,
      passkeyProf,
      passkeyCaisse: passkeyCaisse || undefined,
      scolarite: Number(scolarite) || 0,
      fraisAnnexes: Number(fraisAnnexes) || 0,
      gratuiteFilles1er,
      gratuiteFilles2nd,
      subscriptionDays: Number(subscriptionDays) || 30,
      subscriptionPrice: Number(subscriptionPrice) || 15000,
      subscriptionDurationMonths: Number(subscriptionDurationMonths) || 1,
      fedaPayPublicKey: fedaPayPublicKey.trim() || undefined,
      supportWhatsAppNumber: supportWhatsAppNumber.replace(/\D/g, '') || undefined,
    }
    try {
      const result = await bootstrapSchool(firebase.auth, firebase.db, input)
      // Auto sign-in the freshly-created admin so the vendor lands in
      // the Command Center already authenticated for that school.
      const cred = await signInWithEmailAndPassword(
        firebase.auth,
        result.adminEmail,
        input.adminPassword
      )
      completeBootstrap(cred.user)
    } catch (err) {
      console.error('[bootstrap] failed:', err)
      setStatus({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : "L'initialisation a échoué. Voir la console pour le détail.",
      })
    }
  }

  return (
    <div className="px-4 py-5 space-y-4">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.18em] text-gold-dark font-bold mb-1">
            Nouvelle école
          </p>
          <h1 className="font-display text-2xl font-bold text-navy leading-tight">
            Initialiser {school.name}
          </h1>
          <p className="text-[0.82rem] text-ink-600 mt-1 leading-relaxed">
            Projet Firebase :{' '}
            <span className="font-mono text-[0.76rem] bg-ink-50 px-1.5 py-0.5 rounded border border-ink-200">
              {firebase.projectId}
            </span>
          </p>
        </div>

        {/* Pre-check feedback */}
        {status.kind === 'checking' && (
          <div className="rounded-lg bg-ink-50 border border-ink-200 p-3 flex items-center gap-2 text-[0.82rem] text-ink-700">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            Vérification de l'état du projet…
          </div>
        )}
        {status.kind === 'already' && (
          <div className="rounded-lg bg-warning-bg/70 border border-warning/40 p-3 flex items-start gap-2">
            <AlertTriangle
              className="h-5 w-5 text-warning-dark shrink-0 mt-0.5"
              aria-hidden
            />
            <div className="text-[0.82rem] text-ink-800 leading-snug space-y-2">
              <p className="font-bold">Projet déjà initialisé</p>
              <p>
                Le projet Firebase {firebase.projectId} contient déjà un
                document <code className="font-mono bg-white px-1 rounded">ecole/config</code>.
                Lancer l'initialisation écraserait les données existantes.
              </p>
              <p>
                Si vous souhaitez gérer cette école, utilisez plutôt{' '}
                <strong>Ajouter une école</strong> (pas{' '}
                <strong>Initialiser</strong>) sur l'écran précédent.
              </p>
              <Button
                variant="secondary"
                onClick={() => void switchSchool()}
                className="mt-1"
              >
                Retour au sélecteur
              </Button>
            </div>
          </div>
        )}
        {status.kind === 'error' && (
          <div className="rounded-lg bg-danger-bg/50 border border-danger/40 p-3 flex items-start gap-2">
            <AlertTriangle
              className="h-5 w-5 text-danger shrink-0 mt-0.5"
              aria-hidden
            />
            <div className="text-[0.82rem] text-ink-800 leading-snug space-y-2">
              <p className="font-bold text-danger-dark">Échec</p>
              <p>{status.message}</p>
              <Button
                variant="secondary"
                onClick={() => setStatus({ kind: 'ready' })}
              >
                Réessayer
              </Button>
            </div>
          </div>
        )}

        {/* Form sections — only shown when ready or submitting */}
        {(status.kind === 'ready' || status.kind === 'submitting') && (
          <>
            {/* Identité */}
            <SectionCard
              title="Identité de l'école"
              icon={<School className="h-4 w-4" aria-hidden />}
              description="Ce qui apparaît sur les bulletins, reçus, et en-têtes."
            >
              <div className="p-4 space-y-3">
                <Input
                  label="Nom de l'école *"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="CEG HOUETO"
                  maxLength={80}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Ville"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                    placeholder="Cotonou"
                    maxLength={40}
                  />
                  <Input
                    label="Devise"
                    value={devise}
                    onChange={(e) => setDevise(e.target.value)}
                    placeholder="F"
                    maxLength={6}
                  />
                </div>
                <Input
                  label="Adresse"
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="Quartier, rue…"
                  maxLength={120}
                />
                <Input
                  label="Téléphone de contact"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="+229 01 97 00 00 00"
                  hint="Chiffres seuls — le formatage est fait à l'affichage."
                  maxLength={20}
                />
                <Input
                  label="Année scolaire active *"
                  value={anneeActive}
                  onChange={(e) => setAnneeActive(e.target.value)}
                  placeholder="2026-2027"
                  hint="Format AAAA-AAAA."
                  leftIcon={<Calendar className="h-4 w-4" aria-hidden />}
                />
              </div>
            </SectionCard>

            {/* Admin */}
            <SectionCard
              title="Administrateur principal"
              icon={<UserIcon className="h-4 w-4" aria-hidden />}
              description="Le premier utilisateur, avec tous les droits. Il pourra en ajouter d'autres ensuite."
            >
              <div className="p-4 space-y-3">
                <Input
                  label="Nom complet *"
                  value={adminNom}
                  onChange={(e) => setAdminNom(e.target.value)}
                  placeholder="DOSSA Henri"
                  maxLength={60}
                />
                <Input
                  label="Email *"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@ecole.bj"
                  autoComplete="off"
                />
                <Input
                  label="Mot de passe *"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  hint="Le directeur pourra le changer ensuite."
                  autoComplete="new-password"
                />
              </div>
            </SectionCard>

            {/* Finances */}
            <SectionCard
              title="Frais de scolarité"
              icon={<Banknote className="h-4 w-4" aria-hidden />}
              description="Les valeurs par défaut. L'admin peut les modifier dans l'onglet Année."
            >
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Scolarité annuelle (FCFA)"
                    type="number"
                    value={scolarite}
                    onChange={(e) => setScolarite(e.target.value)}
                    min={0}
                  />
                  <Input
                    label="Frais annexes (FCFA)"
                    type="number"
                    value={fraisAnnexes}
                    onChange={(e) => setFraisAnnexes(e.target.value)}
                    min={0}
                  />
                </div>
                <CheckboxRow
                  label="Gratuité filles — Premier cycle (6e–3e)"
                  checked={gratuiteFilles1er}
                  onChange={setGratuiteFilles1er}
                />
                <CheckboxRow
                  label="Gratuité filles — Second cycle (2nde–Terminale)"
                  checked={gratuiteFilles2nd}
                  onChange={setGratuiteFilles2nd}
                />
              </div>
            </SectionCard>

            {/* Passkeys */}
            <SectionCard
              title="Codes d'accès du personnel"
              icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
              description="Codes à 6 chiffres que vous partagerez au personnel pour qu'il crée son compte."
            >
              <div className="p-4 space-y-3">
                <Input
                  label="Code Professeurs *"
                  value={passkeyProf}
                  onChange={(e) =>
                    setPasskeyProf(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  hint="Exactement 6 chiffres."
                />
                <Input
                  label="Code Caissiers"
                  value={passkeyCaisse}
                  onChange={(e) =>
                    setPasskeyCaisse(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="654321"
                  inputMode="numeric"
                  maxLength={6}
                  hint="Facultatif — si vide, le code Professeurs sera réutilisé."
                />
              </div>
            </SectionCard>

            {/* Subscription */}
            <SectionCard
              title="Abonnement SaaS"
              icon={<Calendar className="h-4 w-4" aria-hidden />}
              description="Vos conditions commerciales avec l'école. Modifiables ensuite depuis le Command Center."
            >
              <div className="p-4 space-y-3">
                <Input
                  label="Durée avant premier verrouillage (jours)"
                  type="number"
                  value={subscriptionDays}
                  onChange={(e) => setSubscriptionDays(e.target.value)}
                  min={1}
                  hint="Période d'essai ou 1er cycle avant paiement."
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Prix (FCFA)"
                    type="number"
                    value={subscriptionPrice}
                    onChange={(e) => setSubscriptionPrice(e.target.value)}
                    min={0}
                  />
                  <Input
                    label="Durée par cycle (mois)"
                    type="number"
                    value={subscriptionDurationMonths}
                    onChange={(e) => setSubscriptionDurationMonths(e.target.value)}
                    min={1}
                  />
                </div>
                <Input
                  label="Clé publique FedaPay"
                  value={fedaPayPublicKey}
                  onChange={(e) => setFedaPayPublicKey(e.target.value)}
                  placeholder="pk_live_… ou pk_sandbox_…"
                  hint="Facultatif — renseignez plus tard depuis le Command Center."
                />
                <Input
                  label="WhatsApp support (international, sans +)"
                  value={supportWhatsAppNumber}
                  onChange={(e) =>
                    setSupportWhatsAppNumber(
                      e.target.value.replace(/\D/g, '').slice(0, 15)
                    )
                  }
                  placeholder="22997000000"
                  inputMode="numeric"
                  hint="Apparaît sur la page de verrouillage pour contact."
                />
              </div>
            </SectionCard>

            {/* Info + Submit */}
            <div className="rounded-lg bg-info-bg/40 border border-navy/10 p-3 flex items-start gap-2">
              <Info
                className="h-4 w-4 text-navy shrink-0 mt-0.5"
                aria-hidden
              />
              <p className="text-[0.76rem] text-ink-700 leading-snug">
                L'initialisation crée l'utilisateur administrateur et
                9 documents Firestore en une seule opération. Si une
                erreur survient après la création de l'utilisateur,
                supprimez-le dans Firebase Console avant de réessayer.
              </p>
            </div>

            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={status.kind === 'submitting' || !canSubmit}
              loading={status.kind === 'submitting'}
              icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
              fullWidth
            >
              Initialiser cette école
            </Button>
          </>
        )}
      </div>
  )
}

// ─── Checkbox row ──────────────────────────────────────────

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-navy"
      />
      <span className="text-[0.82rem] text-ink-800">{label}</span>
    </label>
  )
}
