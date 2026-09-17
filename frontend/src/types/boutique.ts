/**
 * Types partagés — module boutique (miroir de apps.boutique.models /
 * serializers côté backend, Phase 2A/2B). Garder synchronisé en cas de
 * changement de schéma.
 */

export type CategorieProduit =
  "vetements" | "accessoires" | "articles_club" | "cartes_docs" | "divers";

export type StatutProduit = "brouillon" | "publie" | "archive";

export type StatutCommande =
  "en_attente" | "confirmee" | "en_preparation" | "expediee" | "livree" | "annulee" | "remboursee";

/** Voir apps.boutique.models.ModePaiementCommande. "en_ligne" est confirmé automatiquement par
 * webhook PSP (voir initierPaiementEnLigneCommande/reference_paiement) ; virement/especes restent
 * confirmés manuellement par le Directeur Financier (confirmerPaiementCommande). */
export type ModePaiementCommande = "en_ligne" | "virement" | "especes";

/** Passerelle de paiement en ligne choisie au moment d'initier le paiement (ajouté le
 * 2026-09-17, même principe que apps.cotisations — voir InitierPaiementEnLigneCommandeSerializer
 * côté backend). Contrairement à Cotisation.mode_paiement, ModePaiementCommande.EN_LIGNE ne
 * distingue pas la passerelle : le choix se fait ici, à l'appel de l'API. */
export type PasserelleCommande = "stripe" | "paypal";

/** Voir apps.boutique.models.MotifRetour. */
export type MotifRetour =
  "defectueux" | "mauvaise_taille" | "ne_convient_pas" | "erreur_envoi" | "autre";

export interface VarianteProduit {
  id: string;
  produit: string;
  taille: string;
  couleur: string;
  stock: number;
}

export interface Produit {
  id: string;
  nom: string;
  categorie: CategorieProduit;
  description: string;
  prix: string;
  /** Rabais optionnel en % (1-90), voir Produit.pourcentage_reduction / prix_final côté backend. */
  pourcentage_reduction: number | null;
  /** Prix effectivement facturé (lecture seule) — prix avec le rabais appliqué s'il y en a un ;
   * c'est TOUJOURS cette valeur qui doit être affichée/utilisée, jamais `prix` seul. */
  prix_final: string;
  image: string | null;
  statut: StatutProduit;
  nouveaute: boolean;
  seuil_alerte_stock: number;
  variantes: VarianteProduit[];
  stock_total: number;
  stock_faible: boolean;
  en_rupture: boolean;
  created_at: string;
  updated_at: string;
}

/** Payload de POST/PATCH /boutique/produits/ (Bureau Admin+, CatalogueBoutiquePermission). */
export interface ProduitPayload {
  nom: string;
  categorie: CategorieProduit;
  description?: string;
  prix: string;
  pourcentage_reduction?: number | null;
  statut?: StatutProduit;
  nouveaute?: boolean;
  seuil_alerte_stock?: number;
  /** Écriture seule, à la création uniquement — crée une variante "unique" (taille/couleur
   * vides) avec ce stock. Ignoré par le backend en modification (PATCH). */
  stock_initial?: number;
}

/** Payload de POST/PATCH /boutique/variantes/ (Bureau Admin+). */
export interface VariantePayload {
  produit: string;
  taille?: string;
  couleur?: string;
  stock: number;
}

export interface LigneCommande {
  id: string;
  variante: string;
  quantite: number;
  prix_unitaire: string;
  sous_total: string;
  /** Somme des retours déjà enregistrés sur cette ligne (lecture seule). */
  quantite_retournee: number;
  /** Quantité qu'il reste possible de retourner sur cette ligne (lecture seule) —
   * `quantite - quantite_retournee`, jamais négatif. */
  quantite_retournable: number;
}

/** Un retour partiel enregistré sur une ligne de commande — voir apps.boutique.models.Retour.
 * Registre append-only : pas d'update/destroy, uniquement create/list (Bureau Admin+). */
export interface Retour {
  id: string;
  commande: string;
  ligne_commande: string;
  quantite: number;
  motif: MotifRetour;
  commentaire: string;
  enregistre_par: string | null;
  created_at: string;
}

/** Entrée de POST /boutique/retours/ (Bureau Admin+). */
export interface RetourPayload {
  commande: string;
  ligne_commande: string;
  quantite: number;
  motif: MotifRetour;
  commentaire?: string;
}

export interface Commande {
  id: string;
  numero_commande: string;
  membre: string;
  nom_destinataire: string;
  adresse_livraison: string;
  code_postal_livraison: string;
  ville_livraison: string;
  pays_livraison: string;
  telephone_livraison: string;
  montant_total: string;
  statut: StatutCommande;
  /** Renseigné par `confirmer_paiement` (ou par `expedier` en nacherfassement) — vide tant
   * qu'aucun paiement n'a été confirmé. */
  mode_paiement: ModePaiementCommande | "";
  date_paiement_confirme: string | null;
  paiement_confirme_par: string | null;
  /** Référence externe du paiement PSP (ex. "STRIPE-pi_xxx" / "PAYPAL-xxx") — renseignée
   * uniquement pour un paiement confirmé automatiquement via webhook, jamais pour une
   * confirmation manuelle (voir apps.boutique.webhooks). */
  reference_paiement: string;
  numero_suivi: string;
  transporteur: string;
  date_expedition: string | null;
  lignes: LigneCommande[];
  retours: Retour[];
  created_at: string;
  updated_at: string;
}

/** Une ligne du panier envoyée à POST /boutique/commandes/passer/ — jamais de prix (CLAUDE.md §8,
 * voir PasserCommandeSerializer/CommandeViewSet.passer côté backend : prix entièrement
 * recalculé côté serveur à partir du produit lié à la variante). */
export interface LigneCommandeEntree {
  variante: string;
  quantite: number;
}

export interface PasserCommandePayload {
  lignes: LigneCommandeEntree[];
  nom_destinataire: string;
  adresse_livraison: string;
  code_postal_livraison: string;
  ville_livraison: string;
  pays_livraison: string;
  telephone_livraison?: string;
}

/** Entrée de POST /boutique/commandes/{id}/changer-statut/ (Bureau Admin+). */
export interface ChangerStatutCommandePayload {
  statut: StatutCommande;
}

/** Entrée de POST /boutique/commandes/{id}/confirmer-paiement/ (Directeur Financier+ —
 * demande utilisateur du 2026-09-15). */
export interface ConfirmerPaiementCommandePayload {
  mode_paiement: ModePaiementCommande;
}

/** Entrée de POST /boutique/commandes/{id}/initier-paiement-en-ligne/ (ajouté le 2026-09-17,
 * même principe que Cotisation/AHM-46) — réservé au propriétaire de la commande. */
export interface InitierPaiementEnLigneCommandePayload {
  passerelle: PasserelleCommande;
}

/** Réponse de POST /boutique/commandes/{id}/initier-paiement-en-ligne/ — l'URL de redirection
 * Stripe Checkout ou PayPal Checkout vers laquelle le navigateur doit naviguer
 * (window.location.href), voir apps.cotisations.gateways (partagé avec apps.boutique). */
export interface PaiementEnLigneCommandeResponse {
  redirect_url: string;
}

/** Entrée de POST /boutique/commandes/{id}/expedier/ (Directeur Financier+).
 * `nacherfassement: true` saute directement à `expediee` pour une commande gérée hors flux
 * normal (paiement jamais confirmé dans le système) — `mode_paiement` devient alors
 * obligatoire, voir apps.boutique.serializers.ExpedierCommandeSerializer côté backend. */
export interface ExpedierCommandePayload {
  numero_suivi: string;
  transporteur?: string;
  /** ISO 8601, ne peut pas être dans le futur — pour une saisie rétroactive uniquement,
   * sinon la date de l'action est utilisée par défaut. */
  date_expedition?: string;
  nacherfassement?: boolean;
  mode_paiement?: ModePaiementCommande;
}

/**
 * Transitions valides pour l'action de gestion générale `changer_statut` — copie côté UI de
 * apps.boutique.models.TRANSITIONS_STATUT_COMMANDE, uniquement pour ne proposer que des
 * transitions cohérentes dans le sélecteur admin ; le backend reste seul juge (toute
 * incohérence ici ne ferait qu'afficher une option refusée par l'API, jamais un trou de
 * sécurité). Garder synchronisé en cas de changement du modèle.
 *
 * en_attente -> confirmee et {confirmee, en_preparation} -> expediee ne sont VOLONTAIREMENT
 * plus dans cette table (demande utilisateur du 2026-09-15) : ces deux transitions passent
 * désormais exclusivement par les actions dédiées `confirmer_paiement`/`expedier`
 * (Directeur Financier+), pour garantir qu'une commande n'est jamais expédiée sans paiement
 * confirmé au préalable.
 */
export const TRANSITIONS_STATUT_COMMANDE: Record<StatutCommande, StatutCommande[]> = {
  en_attente: ["annulee"],
  confirmee: ["en_preparation", "annulee"],
  en_preparation: ["annulee"],
  expediee: ["livree", "remboursee"],
  livree: ["remboursee"],
  annulee: [],
  remboursee: [],
};

export const STATUTS_ANNULABLES: StatutCommande[] = ["en_attente", "confirmee"];

/** Statuts depuis lesquels `confirmer_paiement` est possible. */
export const STATUTS_CONFIRMABLES_PAIEMENT: StatutCommande[] = ["en_attente"];

/** Statuts depuis lesquels `expedier` est possible en flux normal (paiement déjà confirmé). */
export const STATUTS_EXPEDIABLES_NORMAL: StatutCommande[] = ["confirmee", "en_preparation"];

/** Statuts depuis lesquels `expedier` est possible avec `nacherfassement: true`. */
export const STATUTS_EXPEDIABLES_NACERFASSEMENT: StatutCommande[] = [
  ...STATUTS_EXPEDIABLES_NORMAL,
  "en_attente",
];

/**
 * Statuts depuis lesquels une commande accepte encore des retours — "Nacherfassung von
 * Retouren" (demande utilisateur du 2026-09-15, précisée le 2026-09-16) : volontairement
 * indépendant du statut de la commande (symétrique à `expedier(nacherfassement)`), sauf
 * annulee/remboursee où le stock a déjà été intégralement restitué (double comptage sinon).
 */
export const STATUTS_RETOURNABLES: StatutCommande[] = [
  "en_attente",
  "confirmee",
  "en_preparation",
  "expediee",
  "livree",
];
