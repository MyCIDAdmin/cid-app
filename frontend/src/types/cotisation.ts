/**
 * Types partagés — module cotisations (miroir de apps.cotisations.models /
 * serializers côté backend, AHM-15). Garder synchronisé en cas de
 * changement de schéma.
 */

// Sous-ensemble exposé par le stepper (AHM-16) : "evenement" est exclu tant
// que apps.evenements n'existe pas (pas d'événement à sélectionner — voir
// MONTANTS_CATALOGUE côté backend, qui ne couvre de toute façon que ces
// deux tarifs fixes). "autre" ajouté le 2026-09-17 (retour utilisateur :
// catalogue d'articles géré par l'App-Admin, voir ArticleCatalogue plus bas) —
// vient s'ajouter aux 3 choix existants, jamais les remplacer.
export type TypeArticleStepper = "cotisation" | "adhesion" | "don" | "autre";
export type TypeArticle = TypeArticleStepper | "evenement";

export type ModePaiement = "carte" | "virement_sepa" | "paypal";

export type StatutCotisation = "en_attente" | "payee" | "echouee" | "remboursee" | "annulee";

export interface Cotisation {
  id: string;
  membre: string;
  type_article: TypeArticle;
  article_catalogue: string | null;
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
 * envoyés que pour "don" — pour cotisation/adhesion/autre le serializer
 * impose le tarif catalogue côté serveur et ignore toute valeur transmise.
 * `article_catalogue` (id) n'est envoyé que pour type_article="autre" (voir
 * ArticleCatalogue plus bas, ajouté le 2026-09-17).
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
  article_catalogue?: string;
}

// Tarifs de repli affichés avant le premier chargement de useArticlesCatalogue() (voir
// CotisationStepperPage) — le montant réellement enregistré est de toute façon toujours
// recalculé par le serveur (CLAUDE.md §8, CotisationSerializer.validate). Depuis le 2026-09-17
// (retour utilisateur : "die bestehende [Cotisation annuelle/Frais d'adhésion] müssen auch
// verwaltbar sein"), ces tarifs sont pilotés par l'Administrateur App via ArticleCatalogue.
// type_fixe et ne sont donc plus la source de vérité — seulement un affichage initial le temps
// que la requête réseau réponde.
export const MONTANTS_CATALOGUE: Record<"cotisation" | "adhesion", number> = {
  cotisation: 45,
  adhesion: 15,
};

/**
 * Article de paiement, géré par l'Administrateur App (voir apps.cotisations.models.
 * ArticleCatalogue). Deux catégories partagent ce même type, distinguées par `type_fixe` :
 *  - `type_fixe: null` — article personnalisé créé librement par l'Administrateur App (retour
 *    utilisateur du 2026-09-17), vient s'ajouter aux 4 types fixes de TypeArticle.
 *  - `type_fixe: "cotisation" | "adhesion"` — l'une des 2 lignes techniques seedées une fois
 *    (jamais créées/renommées via l'API, voir ArticleCataloguePermission/serializer) qui
 *    représentent les tarifs fixes cotisation annuelle / frais d'adhésion (retour utilisateur
 *    du même jour : "die bestehende [...] müssen auch verwaltbar sein"). Seuls `montant` et
 *    `actif` sont éditables pour ces 2 lignes — `libelle` est ignoré en écriture côté serveur,
 *    l'intitulé affiché aux membres reste piloté par les clés i18n existantes.
 *
 * `actif=false` = désactivé (jamais de suppression physique exposée, voir CotisationViewSet
 * backend) — pour une ligne `type_fixe`, cela retire ce type du stepper de paiement.
 */
export interface ArticleCatalogue {
  id: string;
  libelle: string;
  montant: string;
  actif: boolean;
  type_fixe: "cotisation" | "adhesion" | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleCataloguePayload {
  libelle: string;
  montant: string;
}

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

/**
 * Réponse de POST /cotisations/{id}/initier-paiement-en-ligne/ (AHM-46) — l'URL de redirection
 * Stripe Checkout ou PayPal Checkout vers laquelle le navigateur doit naviguer
 * (window.location.href), voir apps.cotisations.gateways/views.
 */
export interface PaiementEnLigneResponse {
  redirect_url: string;
}

/**
 * Entrée d'historique de statut (ajoutée le 2026-09-19, demande utilisateur : "Bei 'Ausstehende
 * Zahlungen' muss es möglich sein die Historie zu behalten und Zahlungsstatus nachträglich zu
 * ändern") — miroir de apps.cotisations.models.HistoriqueStatutCotisation, entièrement en
 * lecture seule côté client.
 */
export interface HistoriqueStatutCotisation {
  id: string;
  cotisation: string;
  ancien_statut: StatutCotisation;
  nouveau_statut: StatutCotisation;
  motif: string;
  modifie_par: string | null;
  modifie_par_nom: string | null;
  created_at: string;
}

/** Payload de POST /cotisations/{id}/changer-statut/ (Directeur Financier/Admin uniquement). */
export interface ChangerStatutCotisationPayload {
  statut: StatutCotisation;
  motif?: string;
}
