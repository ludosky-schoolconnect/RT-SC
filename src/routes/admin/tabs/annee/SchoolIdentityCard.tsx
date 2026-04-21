/**
 * RT-SC · School identity card (edit nom / ville / devise).
 *
 * Writes to /ecole/config via the existing useUpdateEcoleConfig mutation.
 * Welcome page reads from the same doc so changes appear immediately
 * everywhere (live snapshots + cache invalidation).
 */

import { useEffect, useMemo, useState } from 'react'
import { Building2, MapPin, Phone, Quote, Save } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import {
  useEcoleConfig,
  useUpdateEcoleConfig,
} from '@/hooks/useEcoleConfig'
import { useToast } from '@/stores/toast'

export function SchoolIdentityCard() {
  const { data: config, isLoading } = useEcoleConfig()
  const updateMut = useUpdateEcoleConfig()
  const toast = useToast()

  const [nom, setNom] = useState('')
  const [ville, setVille] = useState('')
  const [devise, setDevise] = useState('')
  const [adresse, setAdresse] = useState('')
  const [telephone, setTelephone] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) {
      setNom(config.nom ?? '')
      setVille(config.ville ?? '')
      setDevise(config.devise ?? '')
      setAdresse(config.adresse ?? '')
      setTelephone(config.telephone ?? '')
    }
  }, [config])

  const isDirty = useMemo(() => {
    return (
      (nom.trim()) !== (config?.nom ?? '') ||
      (ville.trim()) !== (config?.ville ?? '') ||
      (devise.trim()) !== (config?.devise ?? '') ||
      (adresse.trim()) !== (config?.adresse ?? '') ||
      (telephone.trim()) !== (config?.telephone ?? '')
    )
  }, [config, nom, ville, devise, adresse, telephone])

  async function save() {
    setError(null)
    if (!nom.trim()) return setError("Le nom de l'établissement est obligatoire.")

    try {
      await updateMut.mutateAsync({
        nom: nom.trim(),
        ville: ville.trim(),
        devise: devise.trim(),
        adresse: adresse.trim(),
        telephone: telephone.trim(),
      })
      toast.success("Identité de l'établissement mise à jour.")
    } catch {
      setError("Erreur lors de l'enregistrement.")
    }
  }

  return (
    <Card accent>
      <CardHeader>
        <div>
          <CardTitle>Identité de l'établissement</CardTitle>
          <CardDescription>
            Affichée sur la page d'accueil et dans l'en-tête du tableau de bord.
          </CardDescription>
        </div>
      </CardHeader>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="Nom de l'établissement"
            value={nom}
            onChange={(e) => {
              setNom(e.target.value)
              setError(null)
            }}
            placeholder="Ex : Collège Houffon"
            leading={<Building2 className="h-4 w-4" />}
            error={error ?? undefined}
          />
          <Input
            label="Ville"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Ex : Cotonou"
            leading={<MapPin className="h-4 w-4" />}
          />
          <Input
            label="Adresse complète"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="Ex : Quartier Houéto, derrière le marché central"
            leading={<MapPin className="h-4 w-4" />}
            hint="Apparaît sur les reçus de paiement."
          />
          <Input
            label="Téléphone principal"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="Ex : +229 01 97 00 00 00"
            leading={<Phone className="h-4 w-4" />}
            inputMode="tel"
          />
          <Textarea
            label="Devise"
            value={devise}
            onChange={(e) => setDevise(e.target.value)}
            placeholder="Ex : Travail · Discipline · Excellence"
            hint="Une phrase courte qui apparaît sous le nom de l'école."
            rows={2}
          />
          <div className="flex justify-end">
            <Button
              onClick={save}
              disabled={!isDirty}
              loading={updateMut.isPending}
              leadingIcon={<Save className="h-4 w-4" />}
            >
              Enregistrer
            </Button>
          </div>

          {/* Live preview hint */}
          {nom && (
            <div className="mt-2 rounded-md bg-info-bg border border-navy/15 px-4 py-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-navy/70 mb-1">
                Aperçu sur la page d'accueil
              </p>
              <p className="font-display text-base font-bold text-navy">{nom}</p>
              {ville && (
                <p className="text-[0.78rem] text-ink-600 mt-0.5">{ville}</p>
              )}
              {devise && (
                <p className="text-[0.78rem] text-ink-600 italic mt-1">
                  « {devise} »
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
