/**
 * Subscription expiry reminder email — template.
 *
 * Three tone variants depending on days-until-deadline:
 *
 *   - 14 days: friendly heads-up
 *   - 7 days:  urgent but warm
 *   - 3 days:  urgent, last chance
 *   - Overdue: school is in grace period or already locked —
 *              strongly urges action
 *
 * Voice: direct, respectful, never condescending. The admin knows
 * their subscription is a recurring bill — they don't need guilt,
 * they need a clear reminder + a clear action.
 */

import { renderEmailShell, H1, P, StrongP } from '../layout.js'
import { escapeHtml, formatDateFr } from '../format.js'

interface SubReminderInput {
  schoolName: string
  deadline: Date
  /** Days until deadline. NEGATIVE if already past. */
  daysRemaining: number
  /** URL admin clicks to pay — usually the Locked page or Abonnement card. */
  paymentUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderSubscriptionReminder({
  schoolName,
  deadline,
  daysRemaining,
  paymentUrl,
}: SubReminderInput): RenderedEmail {
  const school = escapeHtml(schoolName)
  const deadlineStr = formatDateFr(deadline)

  let subject: string
  let leadText: string
  let urgency: string

  if (daysRemaining < 0) {
    // Already past deadline
    const daysOverdue = Math.abs(daysRemaining)
    subject = `⚠ Abonnement expiré — ${schoolName}`
    leadText = 'Votre abonnement a expiré'
    urgency = `
      ${P(`L'abonnement de <strong>${school}</strong> a expiré il y a <strong>${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}</strong>.`)}
      ${StrongP(`Échéance : ${deadlineStr}`)}
      ${P('Pendant la période de grâce (3 jours), vous pouvez encore accéder à la plateforme. Après cela, l\'école sera automatiquement verrouillée et les professeurs, élèves et parents n\'auront plus accès à leurs espaces jusqu\'au renouvellement.')}
      ${P('Renouvelez dès maintenant pour éviter toute interruption.')}
    `
  } else if (daysRemaining <= 3) {
    subject = `⏰ Abonnement — ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''}`
    leadText = 'Votre abonnement expire bientôt'
    urgency = `
      ${P(`L'abonnement de <strong>${school}</strong> expire dans <strong>${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}</strong>.`)}
      ${StrongP(`Échéance : ${deadlineStr}`)}
      ${P('Pour éviter toute interruption d\'accès pour vos professeurs, élèves et parents, nous vous invitons à renouveler dès que possible.')}
    `
  } else if (daysRemaining <= 7) {
    subject = `Rappel — Abonnement expire dans ${daysRemaining} jours`
    leadText = 'Pensez à renouveler votre abonnement'
    urgency = `
      ${P(`L'abonnement de <strong>${school}</strong> arrive à échéance dans <strong>${daysRemaining} jours</strong>.`)}
      ${StrongP(`Échéance : ${deadlineStr}`)}
      ${P('Le renouvellement se fait en quelques clics depuis l\'onglet Abonnement de votre tableau de bord. Ne laissez pas expirer pour éviter toute perturbation.')}
    `
  } else {
    // 14 days
    subject = `Abonnement — échéance dans 2 semaines`
    leadText = 'Rappel abonnement'
    urgency = `
      ${P(`L'abonnement de <strong>${school}</strong> sera à renouveler dans <strong>${daysRemaining} jours</strong>.`)}
      ${StrongP(`Échéance : ${deadlineStr}`)}
      ${P('Aucune action urgente n\'est requise pour l\'instant — ce courriel est un simple rappel amical. Vous pourrez renouveler à tout moment depuis l\'onglet Abonnement.')}
    `
  }

  const body = `${H1(leadText)}${urgency}`

  const html = renderEmailShell({
    body,
    preheader: leadText,
    cta: {
      label: daysRemaining < 0 ? 'Renouveler maintenant' : 'Accéder à l\'abonnement',
      url: paymentUrl,
    },
    signature: 'L\'équipe SchoolConnect',
  })

  // Plain-text fallback — critical for spam filters and accessibility
  const text = `${leadText}

${
  daysRemaining < 0
    ? `L'abonnement de ${schoolName} a expiré il y a ${Math.abs(daysRemaining)} jour(s).`
    : `L'abonnement de ${schoolName} expire dans ${daysRemaining} jour(s).`
}
Échéance : ${deadlineStr}

Renouvelez ici : ${paymentUrl}

— L'équipe SchoolConnect
`

  return { subject, html, text }
}
