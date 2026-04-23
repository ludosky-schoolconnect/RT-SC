/**
 * Pre-inscription status change email — template.
 *
 * Sent when admin approves or refuses a pre-inscription application.
 * ONLY fires if the applicant provided an email when submitting the
 * form (field is optional). No email = no notification; they'll
 * need to use the tracking code via the tracking panel.
 *
 * Approved:
 *   - Welcoming tone, confirms acceptance
 *   - Lists the scheduled interview date (dateRV) if set
 *   - Tells them they can still track status with their SC-XXXXXX code
 *
 * Refused:
 *   - Respectful, brief
 *   - Includes the rejection reason if admin provided one
 *   - Suggests re-applying next school year
 */

import { renderEmailShell, H1, P, StrongP } from '../layout.js'
import { escapeHtml, formatDateLongFr } from '../format.js'
import type { RenderedEmail } from './subscriptionReminder.js'

interface StatusEmailInput {
  /** Applicant's name — for greeting */
  applicantName: string
  /** School's display name */
  schoolName: string
  /** Tracking code (SC-XXXXXX) so they can look up status */
  trackingCode: string
  /** Tracking URL — where they can paste the code */
  trackingUrl: string
  /** New status */
  statut: 'Approuvé' | 'Refusé'
  /** For Approuvé: the scheduled RV date (optional — admin may not set one) */
  dateRV?: Date
  /** For Approuvé: the target class label (e.g. "6ème A") */
  classeCible?: string
  /** For Refusé: the reason admin provided (optional) */
  raisonRefus?: string
}

export function renderPreInscriptionStatusEmail(
  input: StatusEmailInput
): RenderedEmail {
  const { applicantName, schoolName, trackingCode, trackingUrl, statut } = input
  const name = escapeHtml(applicantName)
  const school = escapeHtml(schoolName)
  const code = escapeHtml(trackingCode)

  if (statut === 'Approuvé') {
    const dateRVBlock = input.dateRV
      ? `${StrongP(`Rendez-vous de confirmation : ${formatDateLongFr(input.dateRV)}`)}${P('Merci de vous présenter à l\'école muni des pièces du dossier à cette date.')}`
      : P('L\'école vous contactera prochainement pour fixer la date du rendez-vous de confirmation.')

    const classeBlock = input.classeCible
      ? P(`Classe d'affectation : <strong>${escapeHtml(input.classeCible)}</strong>`)
      : ''

    const subject = `Dossier approuvé — ${schoolName}`
    const body = `
      ${H1(`Bienvenue à ${school}`)}
      ${P(`Bonjour ${name},`)}
      ${P(`Nous avons le plaisir de vous informer que votre demande de pré-inscription a été <strong>approuvée</strong>.`)}
      ${classeBlock}
      ${dateRVBlock}
      ${P(`Vous pouvez à tout moment consulter l'état de votre dossier avec votre code de suivi :`)}
      ${StrongP(code)}
    `

    const html = renderEmailShell({
      body,
      preheader: `Votre pré-inscription a été approuvée`,
      cta: {
        label: 'Suivre mon dossier',
        url: trackingUrl,
      },
      signature: schoolName,
    })

    const text = `Bonjour ${applicantName},

Nous avons le plaisir de vous informer que votre demande de pré-inscription à ${schoolName} a été APPROUVÉE.
${input.classeCible ? `\nClasse d'affectation : ${input.classeCible}` : ''}
${input.dateRV ? `\nRendez-vous de confirmation : ${formatDateLongFr(input.dateRV)}` : '\nL\'école vous contactera prochainement pour fixer la date du rendez-vous.'}

Code de suivi : ${trackingCode}
Suivre en ligne : ${trackingUrl}

— ${schoolName}
`
    return { subject, html, text }
  }

  // Refusé
  const reasonBlock = input.raisonRefus
    ? P(`<em>Motif : ${escapeHtml(input.raisonRefus)}</em>`)
    : ''

  const subject = `Dossier de pré-inscription — ${schoolName}`
  const body = `
    ${H1(`Décision concernant votre dossier`)}
    ${P(`Bonjour ${name},`)}
    ${P(`Après examen attentif, votre demande de pré-inscription à <strong>${school}</strong> n'a pas pu être retenue pour cette rentrée.`)}
    ${reasonBlock}
    ${P(`Nous vous remercions de l'intérêt porté à notre école et vous invitons à retenter votre chance lors de la prochaine session d'inscription.`)}
    ${P(`Code de suivi : <strong>${code}</strong>`)}
  `

  const html = renderEmailShell({
    body,
    preheader: `Décision concernant votre dossier`,
    signature: schoolName,
  })

  const text = `Bonjour ${applicantName},

Après examen attentif, votre demande de pré-inscription à ${schoolName} n'a pas pu être retenue pour cette rentrée.
${input.raisonRefus ? `\nMotif : ${input.raisonRefus}\n` : ''}
Nous vous remercions de l'intérêt porté à notre école et vous invitons à retenter votre chance lors de la prochaine session.

Code de suivi : ${trackingCode}

— ${schoolName}
`

  return { subject, html, text }
}
