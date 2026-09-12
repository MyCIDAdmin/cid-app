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
  | "vote_resultats";

export interface Notification {
  id: string;
  type_notification: TypeNotification;
  titre: string;
  message: string;
  lien: string;
  lu: boolean;
  created_at: string;
}
