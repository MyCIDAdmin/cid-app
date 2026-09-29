/**
 * Hooks React Query — module boutique.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as boutiqueApi from "../api/boutique";
import type {
  ChangerStatutCommandePayload,
  ConfirmerPaiementCommandePayload,
  ExpedierCommandePayload,
  InitierPaiementEnLigneCommandePayload,
  PasserCommandePayload,
  ProduitImagePayload,
  ProduitPayload,
  RegleReductionPayload,
  RetourLotPayload,
  RetourPayload,
  VariantePayload,
  VendreEspecesCommandePayload,
  VerifierBonAchatPayload,
} from "../types/boutique";

const boutiqueKeys = {
  all: ["boutique"] as const,
  produits: (filtres: boutiqueApi.ProduitsFiltres = {}) =>
    [...boutiqueKeys.all, "produits", filtres] as const,
  produit: (id: string) => [...boutiqueKeys.all, "produit", id] as const,
  variantes: (produitId: string) => [...boutiqueKeys.all, "variantes", produitId] as const,
  variantesParIds: (ids: string[]) =>
    [...boutiqueKeys.all, "variantes-par-ids", [...ids].sort()] as const,
  commandes: (filtres: boutiqueApi.CommandesFiltres = {}) =>
    [...boutiqueKeys.all, "commandes", filtres] as const,
  commande: (id: string) => [...boutiqueKeys.all, "commande", id] as const,
  retours: (filtres: boutiqueApi.RetoursFiltres = {}) =>
    [...boutiqueKeys.all, "retours", filtres] as const,
  reglesReduction: (filtres: boutiqueApi.ReglesReductionFiltres = {}) =>
    [...boutiqueKeys.all, "regles-reduction", filtres] as const,
  bonsAchat: (filtres: boutiqueApi.BonsAchatFiltres = {}) =>
    [...boutiqueKeys.all, "bons-achat", filtres] as const,
};

function invalidateCommandes(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "commandes"] });
}

export function useProduits(filtres: boutiqueApi.ProduitsFiltres = {}) {
  return useQuery({
    queryKey: boutiqueKeys.produits(filtres),
    queryFn: () => boutiqueApi.listProduits(filtres),
  });
}

/**
 * Détail d'un produit (ProduitDetailPage, `/boutique/:id`) — `prix_affiche`/`est_prix_membre`
 * proviennent de cette même requête, déjà résolus côté serveur (voir ProduitSerializer),
 * jamais recalculés dans la page (CLAUDE.md §8).
 */
export function useProduit(id: string | undefined) {
  return useQuery({
    queryKey: boutiqueKeys.produit(id ?? ""),
    queryFn: () => boutiqueApi.getProduit(id as string),
    enabled: Boolean(id),
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

/**
 * Détail d'une commande (page de retour de paiement en ligne) — même principe que
 * useCotisation/AHM-46 : le statut n'est fiable qu'après passage du webhook (asynchrone), d'où
 * `refetch` exposé pour un bouton "vérifier à nouveau" plutôt qu'un polling automatique.
 */
export function useCommande(id: string | undefined) {
  return useQuery({
    queryKey: boutiqueKeys.commande(id ?? ""),
    queryFn: () => boutiqueApi.getCommande(id as string),
    enabled: Boolean(id),
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

/** Galerie de photos supplémentaires (demande utilisateur du 2026-09-27, point 13.1) — même
 * principe que useAjouterImageProjet/useSupprimerImageProjet (hooks/useProjets.ts) : invalide
 * simplement la requête produit(s) parente, `Produit.images` étant imbriqué côté backend. */
export function useAjouterImageProduit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProduitImagePayload) => boutiqueApi.ajouterImageProduit(payload),
    onSuccess: () => invalidateProduits(queryClient),
  });
}

export function useSupprimerImageProduit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => boutiqueApi.supprimerImageProduit(id),
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

/** Paliers de réduction par quantité d'un produit donné (ou tous si `filtres.produit` omis) —
 * voir RegleReductionManager (admin, dans GestionCatalogueTab). */
export function useReglesReduction(filtres: boutiqueApi.ReglesReductionFiltres = {}) {
  return useQuery({
    queryKey: boutiqueKeys.reglesReduction(filtres),
    queryFn: () => boutiqueApi.listReglesReduction(filtres),
    enabled: !!filtres.produit,
  });
}

function invalidateReglesReduction(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "regles-reduction"] });
}

export function useCreerRegleReduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegleReductionPayload) => boutiqueApi.creerRegleReduction(payload),
    onSuccess: () => {
      invalidateReglesReduction(queryClient);
      invalidateProduits(queryClient);
    },
  });
}

export function useModifierRegleReduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<RegleReductionPayload> }) =>
      boutiqueApi.modifierRegleReduction(id, payload),
    onSuccess: () => {
      invalidateReglesReduction(queryClient);
      invalidateProduits(queryClient);
    },
  });
}

export function useSupprimerRegleReduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => boutiqueApi.supprimerRegleReduction(id),
    onSuccess: () => {
      invalidateReglesReduction(queryClient);
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
      // Une commande auto-confirmée (paiement déjà couvert par un bon d'achat, ou éligible à
      // une confirmation immédiate) peut avoir généré de nouveaux bons d'achat si elle contient
      // une ligne "bon_achat" (voir _generer_bons_achat côté backend) — sans quoi "Mes bons
      // d'achat" resterait périmé jusqu'au prochain remontage de la page.
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "bons-achat"] });
    },
  });
}

/**
 * Vente au comptoir/vereinfachter Kassenverkauf pour un autre membre (ajouté le 2026-09-21,
 * F-015) — utilisé par PaiementEspecesForm (CotisationsEnAttentePage), voir
 * boutiqueApi.vendreEspeces. Décrémente le stock côté serveur, d'où l'invalidation des
 * produits en plus des commandes (même principe que usePasserCommande) — toujours immédiatement
 * confirmée, donc une ligne "bon_achat" y génère systématiquement son bon (voir
 * usePasserCommande ci-dessus pour la même invalidation).
 */
export function useVendreEspeces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VendreEspecesCommandePayload) => boutiqueApi.vendreEspeces(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "commandes"] });
      invalidateProduits(queryClient);
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "bons-achat"] });
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

/** Confirme la réception du paiement (Directeur Financier+) — voir boutiqueApi.confirmerPaiementCommande. */
export function useConfirmerPaiementCommande() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ConfirmerPaiementCommandePayload }) =>
      boutiqueApi.confirmerPaiementCommande(id, payload),
    onSuccess: () => invalidateCommandes(queryClient),
  });
}

/**
 * Initie un paiement en ligne (Stripe/PayPal Checkout, ajouté le 2026-09-17) — le composant
 * appelant est responsable de la redirection (`window.location.href = redirect_url`) après
 * succès, même principe que useInitierPaiementEnLigne (cotisations).
 */
export function useInitierPaiementEnLigneCommande() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: InitierPaiementEnLigneCommandePayload }) =>
      boutiqueApi.initierPaiementEnLigneCommande(id, payload),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: boutiqueKeys.commande(variables.id) }),
  });
}

/** Expédie la commande, flux normal ou nacherfassement (Directeur Financier+) — voir
 * boutiqueApi.expedierCommande. */
export function useExpedierCommande() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ExpedierCommandePayload }) =>
      boutiqueApi.expedierCommande(id, payload),
    onSuccess: () => invalidateCommandes(queryClient),
  });
}

/** Retours enregistrés pour une commande donnée (Bureau Admin+). */
export function useRetours(filtres: boutiqueApi.RetoursFiltres = {}) {
  return useQuery({
    queryKey: boutiqueKeys.retours(filtres),
    queryFn: () => boutiqueApi.listRetours(filtres),
  });
}

/**
 * Enregistre un retour partiel (Bureau Admin+) — réintègre le stock atomiquement côté
 * backend, d'où l'invalidation des variantes en plus des commandes/retours (voir
 * RetourViewSet.perform_create).
 */
export function useCreerRetour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RetourPayload) => boutiqueApi.creerRetour(payload),
    onSuccess: () => {
      invalidateCommandes(queryClient);
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "retours"] });
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "variantes"] });
    },
  });
}

/**
 * Enregistre un retour sur PLUSIEURS lignes/variantes d'une même commande en un seul appel
 * (demande utilisateur du 2026-09-29 : "Bei Shop Verwaltung für Retoure soll es möglich sein,
 * Mengen pro Varianten einzugeben") — mêmes invalidations que useCreerRetour ci-dessus (voir
 * RetourViewSet.lot côté backend).
 */
export function useCreerRetourLot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RetourLotPayload) => boutiqueApi.creerRetourLot(payload),
    onSuccess: () => {
      invalidateCommandes(queryClient);
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "retours"] });
      queryClient.invalidateQueries({ queryKey: [...boutiqueKeys.all, "variantes"] });
    },
  });
}

// --- Bons d'achat (demande utilisateur du 2026-09-23) ---

/** "Mes bons d'achat" (membre) / oversight en lecture seule (Bureau Admin+) — même scope IDOR
 * géré côté backend que useCommandes, voir MesBonsAchatPage/GestionBonsAchatTab. Un bon n'est
 * plus acheté/confirmé via un endpoint dédié depuis le 2026-09-23 (voir docstring de tête de
 * types/boutique.ts) : il naît déjà `actif`, généré automatiquement à la confirmation de la
 * commande qui l'a acheté (voir usePasserCommande/useVendreEspeces plus haut). */
export function useBonsAchat(filtres: boutiqueApi.BonsAchatFiltres = {}) {
  return useQuery({
    queryKey: boutiqueKeys.bonsAchat(filtres),
    queryFn: () => boutiqueApi.listBonsAchat(filtres),
  });
}

/** Aperçu non-consommant d'un code de bon d'achat au checkout — voir PanierCommandePage. Pas de
 * cache/queryKey dédié : appelé à la demande (bouton "Vérifier"), jamais automatiquement. */
export function useVerifierBonAchat() {
  return useMutation({
    mutationFn: (payload: VerifierBonAchatPayload) => boutiqueApi.verifierBonAchat(payload),
  });
}
