/**
 * Client API — module boutique (TDD §2.4, backend/apps/boutique/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  ChangerStatutCommandePayload,
  Commande,
  PasserCommandePayload,
  Produit,
  ProduitPayload,
  StatutCommande,
  StatutProduit,
  VarianteProduit,
  VariantePayload,
} from "../types/boutique";

export interface ProduitsFiltres {
  categorie?: string;
  statut?: StatutProduit;
  nouveaute?: boolean;
  cursor?: string;
}

/**
 * Catalogue — lecture ouverte à tout authentifié (CatalogueBoutiquePermission) : un rôle
 * < Bureau Admin ne reçoit de toute façon que les produits publiés (voir
 * ProduitViewSet.get_queryset côté backend), inutile de le refiltrer ici.
 */
export async function listProduits(filtres: ProduitsFiltres = {}): Promise<CursorPage<Produit>> {
  const { data } = await apiClient.get<CursorPage<Produit>>("/boutique/produits/", {
    params: filtres,
  });
  return data;
}

export async function creerProduit(payload: ProduitPayload): Promise<Produit> {
  const { data } = await apiClient.post<Produit>("/boutique/produits/", payload);
  return data;
}

export async function modifierProduit(
  id: string,
  payload: Partial<ProduitPayload>,
): Promise<Produit> {
  const { data } = await apiClient.patch<Produit>(`/boutique/produits/${id}/`, payload);
  return data;
}

export async function supprimerProduit(id: string): Promise<void> {
  await apiClient.delete(`/boutique/produits/${id}/`);
}

export async function listVariantes(produitId: string): Promise<CursorPage<VarianteProduit>> {
  const { data } = await apiClient.get<CursorPage<VarianteProduit>>("/boutique/variantes/", {
    params: { produit: produitId },
  });
  return data;
}

export async function creerVariante(payload: VariantePayload): Promise<VarianteProduit> {
  const { data } = await apiClient.post<VarianteProduit>("/boutique/variantes/", payload);
  return data;
}

export async function modifierVariante(
  id: string,
  payload: Partial<VariantePayload>,
): Promise<VarianteProduit> {
  const { data } = await apiClient.patch<VarianteProduit>(`/boutique/variantes/${id}/`, payload);
  return data;
}

export async function supprimerVariante(id: string): Promise<void> {
  await apiClient.delete(`/boutique/variantes/${id}/`);
}

export interface CommandesFiltres {
  statut?: StatutCommande;
  cursor?: string;
}

/**
 * Bureau Admin+ voit toutes les commandes ; en dessous, uniquement les siennes (IDOR géré
 * côté backend — CommandeViewSet.get_queryset) : cette fonction sert donc aussi bien à
 * "Mes commandes" (membre) qu'à la liste de gestion admin, selon le rôle courant.
 */
export async function listCommandes(filtres: CommandesFiltres = {}): Promise<CursorPage<Commande>> {
  const { data } = await apiClient.get<CursorPage<Commande>>("/boutique/commandes/", {
    params: filtres,
  });
  return data;
}

export async function passerCommande(payload: PasserCommandePayload): Promise<Commande> {
  const { data } = await apiClient.post<Commande>("/boutique/commandes/passer/", payload);
  return data;
}

export async function annulerCommande(id: string): Promise<Commande> {
  const { data } = await apiClient.post<Commande>(`/boutique/commandes/${id}/annuler/`);
  return data;
}

export async function changerStatutCommande(
  id: string,
  payload: ChangerStatutCommandePayload,
): Promise<Commande> {
  const { data } = await apiClient.post<Commande>(
    `/boutique/commandes/${id}/changer-statut/`,
    payload,
  );
  return data;
}
