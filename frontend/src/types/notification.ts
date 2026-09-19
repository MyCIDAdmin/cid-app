/**
 * Types partagés — module notifications (miroir de
 * apps.notifications.models/serializers côté backend, Phase 2B).
 */

export type TypeNotification =
  | "bienvenue"
  | "paiement_confirme"
  | "relance_cotisation"
  | "evenement_invitation"
  | "evenement_rappel"
  | "boutique_commande_confirmee"
  | "boutique_commande_expediee"
  | "vote_ouverture"
  | "vote_resultats"
  | "message_prive_recu"
  // Ajoutés le 2026-09-16 (demande utilisateur : "Baue notification wo du siehst, dass es
  // Sinn macht") — voir backend/apps/notifications/models.py TypeNotification.
  | "adhesion_campagne_publiee"
  | "adhesion_justificatif_valide"
  | "adhesion_justificatif_refuse"
  | "adhesion_souscription_annulee"
  | "evenement_annule"
  | "boutique_commande_annulee"
  | "communaute_reponse_forum"
  // Ajoutés le 2026-09-16 (retour utilisateur : "Es soll bei allen Admin Modulen aber auch
  // bei Messaging und Austausch Modulen funktionieren") — voir backend/apps/notifications/
  // models.py TypeNotification pour le détail des 6 nouveaux points d'intégration.
  | "adhesion_justificatif_soumis"
  | "accounts_nouvelle_inscription"
  | "cotisation_paiement_attente"
  | "boutique_nouvelle_commande"
  | "communaute_message_groupe"
  | "communaute_commentaire_fil";

export interface Notification {
  id: string;
  type_notification: TypeNotification;
  titre: string;
  message: string;
  lien: string;
  lu: boolean;
  created_at: string;
}

/**
 * Modules pouvant chacun activer/désactiver leurs emails de notification — miroir de
 * backend/apps/notifications/models.py MODULES_NOTIFIABLES (ajouté le 2026-09-19, demande
 * utilisateur : "Die Mail benachrichtigung muss vom App Admin verwaltbar sein... pro Modul").
 * "accounts" en est volontairement absent (emails de sécurité/cycle de vie du compte, jamais
 * désactivables par ce paramétrage — voir docstring de module côté backend).
 */
export const MODULES_NOTIFIABLES = [
  "membres",
  "cotisations",
  "adhesions",
  "evenements",
  "boutique",
  "vote",
  "communaute",
] as const;

export type ModuleNotifiable = (typeof MODULES_NOTIFIABLES)[number];

export type ParametresNotification = {
  [K in ModuleNotifiable as `email_${K}`]: boolean;
} & {
  modifie_par: string | null;
  updated_at: string;
};
