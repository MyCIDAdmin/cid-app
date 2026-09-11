/**
 * Types partagés — module cotisations (miroir de apps.cotisations.models /
 * serializers côté backend, AHM-15). Garder synchronisé en cas de
 * changement de schéma.
 */

// Sous-ensemble exposé par le stepper (AHM-16) : "evenement" est exclu tant
// que apps.evenements n'existe pas (pas d'événement à sélectionner — voir
// MONTANTS_CATALOGUE côté backend, qui ne couvre de toute façon que ces
// deux tarifs fixes).
export type TypeArticleStepper = "cotisation" | "adhesion" | "don";
export type TypeArticle = TypeArticleStepper | "evenement";

export type ModePaiement = "carte" | "virement_sepa" | "paypal";

export type StatutCotisation = "en_attente" | "payee" | "echouee" | "remboursee" | "annulee";

export interface Cotisation {
  id: string;
  membre: string;
  type_article: TypeArticle;
  libelle: string;
  montant: string;
  mode_paiement: ModePaiement | "";
  statut: StatutCotisation;
  reference_transaction: string | null;
  annee: number | null;
  saisie_par: string | null;
  date_paiement: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload de POST /cotisations/ en libre-service (AHM-16) : `membre` est
 * résolu côté vue (CotisationViewSet.perform_create) à partir du compte
 * authentifié, jamais transmis par le client. `libelle`/`montant` ne sont
 * envoyés que pour "don" — pour cotisation/adhesion le serializer impose le
 * tarif catalogue côté serveur et ignore toute valeur transmise.
 *
 * Pas de champ `statut` (AHM-53) : quel que soit le mode de paiement choisi, le serveur impose
 * toujours statut=en_attente pour ce flux — aucune passerelle de paiement réelle ne pouvant le
 * confirmer (AHM-46). Le paiement attend une confirmation manuelle du Directeur Financier/Admin.
 */
export interface CotisationCreatePayload {
  type_article: TypeArticleStepper;
  mode_paiement: ModePaiement;
  libelle?: string;
  montant?: string;
}

// Tarifs catalogue affichés côté client à titre indicatif (récapitulatif) —
// le montant réellement enregistré est toujours recalculé par le serveur
// (CLAUDE.md §8, apps.cotisations.serializers.CotisationSerializer.validate).
export const MONTANTS_CATALOGUE: Record<"cotisation" | "adhesion", number> = {
  cotisation: 45,
  adhesion: 15,
};

/**
 * Échéance des relances de cotisation, configurable par année (AHM-54, suite retour
 * utilisateur sur AHM-18) — voir apps.cotisations.models.ConfigurationRelance. `modifie_par` est
 * résolu côté serveur (l'utilisateur courant), jamais transmis par le client.
 */
export interface ConfigurationRelance {
  id: string;
  annee: number;
  date_echeance: string; // format YYYY-MM-DD
  modifie_par: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigurationRelancePayload {
  annee: number;
  date_echeance: string;
}
