/**
 * RT-SC · Firebase Auth error translator.
 * Translates Firebase error codes into user-friendly French messages.
 */

import type { FirebaseError } from 'firebase/app'

export function translateAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err && 'code' in err
      ? String((err as FirebaseError).code)
      : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email ou mot de passe incorrect.'
    case 'auth/invalid-email':
      return "L'adresse email est invalide."
    case 'auth/email-already-in-use':
      return 'Cette adresse email est déjà utilisée.'
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 8 caractères.'
    case 'auth/network-request-failed':
      return 'Erreur de connexion. Vérifiez votre internet.'
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessayez dans quelques minutes.'
    case 'auth/user-disabled':
      return 'Ce compte a été désactivé.'
    case 'auth/operation-not-allowed':
      return 'Opération non autorisée.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Connexion annulée.'
    default:
      return 'Une erreur est survenue. Veuillez réessayer.'
  }
}
