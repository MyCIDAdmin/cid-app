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
  lignes: LigneCommande[];
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

/**
 * Transitions valides pour l'action de gestion `changer_statut` — copie côté UI de
 * apps.boutique.models.TRANSITIONS_STATUT_COMMANDE, uniquement pour ne proposer que des
 * transitions cohérentes dans le sélecteur admin ; le backend reste seul juge (toute
 * incohérence ici ne ferait qu'afficher une option refusée par l'API, jamais un trou de
 * sécurité). Garder synchronisé en cas de changement du modèle.
 */
export const TRANSITIONS_STATUT_COMMANDE: Record<StatutCommande, StatutCommande[]> = {
  en_attente: ["confirmee", "annulee"],
  confirmee: ["en_preparation", "annulee"],
  en_preparation: ["expediee", "annulee"],
  expediee: ["livree", "remboursee"],
  livree: ["remboursee"],
  annulee: [],
  remboursee: [],
};

export const STATUTS_ANNULABLES: StatutCommande[] = ["en_attente", "confirmee"];
