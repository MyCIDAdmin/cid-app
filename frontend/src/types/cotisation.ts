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
// "autre_libre" ajouté le 2026-09-21 (retour utilisateur : "Füge noch einen Artikeltyp 'anders'
// mit einem Freitextfeld hinzu") — même mécanique libre (libellé/montant saisis à la main) que
// "don", mais jamais proposé dans le stepper libre-service (TypeArticleStepper ci-dessus),
// uniquement par le Directeur Financier/Admin (voir CotisationSaisieEspecesPayload plus bas).
// "projet" ajouté le 2026-09-22 (module Projets & Actions, demande utilisateur point 2 : "freie
// Beiträge pro Projekt zu zahlen") — même mécanique libre que "don", mais toujours liée à un
// projet précis via le champ `projet` ci-dessous ; voir types/projets.ts et
// CotisationContribuerProjetPayload plus bas. Jamais proposée dans le stepper générique
// (TypeArticleStepper) : la contribution se fait depuis la kachel du projet elle-même (voir
// hooks/useProjets.useContribuerProjet), pas depuis CotisationStepperPage.
export type TypeArticle = TypeArticleStepper | "evenement" | "autre_libre" | "projet";

// "especes" ajouté le 2026-09-21 (retour utilisateur : "Es soll möglich sein eine Zahlung als
// Barzahlung einzutragen") — jamais proposé en libre-service (voir CotisationStepperPage, qui
// continue à n'utiliser que les 3 premiers), uniquement par le Directeur Financier/Admin pour
// confirmer un paiement en_attente ou enregistrer directement une nouvelle transaction déjà
// reçue en espèces (voir CotisationsEnAttentePage).
export type ModePaiement = "carte" | "virement_sepa" | "paypal" | "especes";

export type StatutCotisation = "en_attente" | "payee" | "echouee" | "remboursee" | "annulee";

export interface Cotisation {
  id: string;
  membre: string;
  type_article: TypeArticle;
  article_catalogue: string | null;
  /** Renseigné uniquement quand type_article="projet" (module Projets & Actions, voir
   * types/projets.ts). */
  projet: string | null;
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

/**
 * Payload de POST /cotisations/ pour une contribution libre à un projet (module Projets &
 * Actions, demande utilisateur point 2 du 2026-09-22) — même principe que "don"
 * (CotisationCreatePayload) : `membre` est résolu côté vue à partir du compte authentifié,
 * `libelle` par défaut ("Contribution — <titre du projet>") si omis. Le serveur refuse la
 * requête si `projet.cagnote_active` est faux ou si l'échéance du projet est dépassée — voir
 * CotisationSerializer.validate, branche TypeArticle.PROJET.
 */
export interface CotisationContribuerProjetPayload {
  type_article: "projet";
  projet: string;
  montant: string;
  mode_paiement: ModePaiement;
  libelle?: string;
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
  /** Date de transaction backdatée (demande utilisateur du 2026-09-29 : "Bei
   * Zahlungsbestätigung Im Modul 'Zahlungen' [...] das Transaktionsdatum bei der Bestätigung
   * hinzufügen") — pertinente uniquement pour une transition vers `payee` (ignorée sinon côté
   * backend, voir CotisationViewSet.changer_statut) ; format "YYYY-MM-DD" (`<input
   * type="date">`), jamais dans le futur (voir _valider_date_paiement_non_future). Absente ou
   * vide -> comportement inchangé (date du jour, voir Cotisation.save()). */
  date_paiement?: string;
}

/**
 * Filtres de la page "Ausstehende Zahlungen" (élargis le 2026-09-21, retour utilisateur : "Filter
 * Möglichkeiten hinzufügen") — miroir de apps.cotisations.filters.CotisationFilter. `statut` est
 * désormais piloté par les onglets (voir CotisationsEnAttentePage), les autres champs par une
 * ligne de filtres additionnelle.
 */
export interface CotisationsGestionFiltres {
  statut?: StatutCotisation | "";
  type_article?: TypeArticle | "";
  mode_paiement?: ModePaiement | "";
  q?: string;
  date_creation_apres?: string;
  date_creation_avant?: string;
}

/**
 * Payload de POST /cotisations/ pour enregistrer directement une transaction en espèces pour le
 * compte d'un membre (F-015 étendu, retour utilisateur du 2026-09-21 : "Es soll möglich sein eine
 * Zahlung als Barzahlung einzutragen") — réservé au Directeur Financier/Admin côté backend (voir
 * CotisationViewSet.perform_create). Contrairement à CotisationCreatePayload (libre-service),
 * `membre` et `statut` sont explicites : la transaction est déjà considérée reçue (statut=payee).
 */
export interface CotisationSaisieEspecesPayload {
  membre: string;
  // "evenement" est exclu : une inscription-évènement payée en espèces passe par un endpoint
  // dédié (POST /evenements/evenements/inscrire-especes/, voir InscrireEspecesPayload et
  // useInscrireEspeces) — jamais par POST /cotisations/, voir docstring de module de
  // apps.evenements.services.
  type_article: TypeArticleStepper | "autre_libre";
  mode_paiement: "especes";
  statut: "payee";
  libelle?: string;
  montant?: string;
  article_catalogue?: string;
}
