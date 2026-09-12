/**
 * Hooks React Query — module boutique.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as boutiqueApi from "../api/boutique";
import type {
  ChangerStatutCommandePayload,
  PasserCommandePayload,
  ProduitPayload,
  VariantePayload,
} from "../types/boutique";

const boutiqueKeys = {
  all: ["boutique"] as const,
  produits: (filtres: boutiqueApi.ProduitsFiltres = {}) =>
    [...boutiqueKeys.all, "produits", filtres] as const,
  variantes: (produitId: string) => [...boutiqueKeys.all, "variantes", produitId] as const,
  variantesParIds: (ids: string[]) =>
    [...boutiqueKeys.all, "variantes-par-ids", [...ids].sort()] as const,
  commandes: (filtres: boutiqueApi.CommandesFiltres = {}) =>
    [...boutiqueKeys.all, "commandes", filtres] as const,
};

export function useProduits(filtres: boutiqueApi.ProduitsFiltres = {}) {
  return useQuery({
    queryKey: boutiqueKeys.produits(filtres),
    queryFn: () => boutiqueApi.listProduits(filtres),
  });
}

export function useVariantes(produitId: string) {
  return useQuery({
    queryKey: boutiqueKeys.variantes(produitId),
    queryFn: () => boutiqueApi.listVariantes(produitId),
    enabled: !!produitId,
  });
}

/**
 * Revalidation live du stock panier — voir listVariantesParIds. `refetchOnMount: "always"`
 * car c'est justement à l'ouverture/retour sur le panier qu'un stock devenu insuffisant
 * (commandé entre-temps par quelqu'un d'autre) doit être détecté ; le cache par défaut de
 * React Query masquerait sinon un changement récent.
 */
export function useVariantesParIds(ids: string[]) {
  return useQuery({
    queryKey: boutiqueKeys.variantesParIds(ids),
    queryFn: () => boutiqueApi.listVariantesParIds(ids),
    enabled: ids.length > 0,
    refetchOnMount: "always",
  });
}

export function useCommandes(filtres: boutiqueApi.CommandesFiltres = {}) {
  return useQuery({
    queryKey: boutiqueKeys.commandes(filtres),
    queryFn: () => boutiqueApi.listCommandes(filtres),
  });
}

function invalidateProduits(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "produits"] });
}

export function useCreerProduit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProduitPayload) => boutiqueApi.creerProduit(payload),
    onSuccess: () => invalidateProduits(queryClient),
  });
}

export function useModifierProduit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ProduitPayload> }) =>
      boutiqueApi.modifierProduit(id, payload),
    onSuccess: () => invalidateProduits(queryClient),
  });
}

export function useTeleverserImageProduit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fichier }: { id: string; fichier: File }) =>
      boutiqueApi.televerserImageProduit(id, fichier),
    onSuccess: () => invalidateProduits(queryClient),
  });
}

export function useSupprimerProduit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => boutiqueApi.supprimerProduit(id),
    onSuccess: () => invalidateProduits(queryClient),
  });
}

export function useCreerVariante() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VariantePayload) => boutiqueApi.creerVariante(payload),
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: boutiqueKeys.variantes(payload.produit) });
      invalidateProduits(queryClient);
    },
  });
}

export function useModifierVariante() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      produitId: string;
      payload: Partial<VariantePayload>;
    }) => boutiqueApi.modifierVariante(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: boutiqueKeys.variantes(variables.produitId) });
      invalidateProduits(queryClient);
    },
  });
}

export function useSupprimerVariante() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; produitId: string }) => boutiqueApi.supprimerVariante(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: boutiqueKeys.variantes(variables.produitId) });
      invalidateProduits(queryClient);
    },
  });
}

export function usePasserCommande() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PasserCommandePayload) => boutiqueApi.passerCommande(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "commandes"] });
      invalidateProduits(queryClient);
    },
  });
}

export function useAnnulerCommande() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => boutiqueApi.annulerCommande(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "commandes"] });
      invalidateProduits(queryClient);
    },
  });
}

export function useChangerStatutCommande() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ChangerStatutCommandePayload }) =>
      boutiqueApi.changerStatutCommande(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "commandes"] });
      invalidateProduits(queryClient);
    },
  });
}
