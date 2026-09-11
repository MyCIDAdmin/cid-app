/**
 * Hooks React Query — module cotisations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as cotisationsApi from "../api/cotisations";
import type {
  ConfigurationRelancePayload,
  CotisationCreatePayload,
  ModePaiement,
} from "../types/cotisation";

const cotisationsKeys = {
  all: ["cotisations"] as const,
  mesCotisations: () => [...cotisationsKeys.all, "mes-cotisations"] as const,
  detail: (id: string) => [...cotisationsKeys.all, "detail", id] as const,
  enAttenteDePaiement: () => [...cotisationsKeys.all, "en-attente-paiement"] as const,
  configurationsRelance: () => [...cotisationsKeys.all, "configurations-relance"] as const,
};

export function useMesCotisations() {
  return useQuery({
    queryKey: cotisationsKeys.mesCotisations(),
    queryFn: () => cotisationsApi.listMesCotisations(),
  });
}

/**
 * Détail d'une cotisation (AHM-46, page de retour Stripe/PayPal) — le statut n'est fiable
 * qu'après passage du webhook (asynchrone), d'où `refetch` exposé pour un bouton "vérifier à
 * nouveau" côté page plutôt qu'un polling automatique.
 */
export function useCotisation(id: string | undefined) {
  return useQuery({
    queryKey: cotisationsKeys.detail(id ?? ""),
    queryFn: () => cotisationsApi.getCotisation(id as string),
    enabled: Boolean(id),
  });
}

export function useCreerCotisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CotisationCreatePayload) => cotisationsApi.creerCotisation(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cotisationsKeys.all }),
  });
}

/**
 * Initie un paiement en ligne (Stripe/PayPal Checkout, AHM-46) — le composant appelant est
 * responsable de la redirection (`window.location.href = redirect_url`) après succès.
 */
export function useInitierPaiementEnLigne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cotisationId: string) => cotisationsApi.initierPaiementEnLigne(cotisationId),
    onSuccess: (_data, cotisationId) =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.detail(cotisationId) }),
  });
}

/** File des paiements à confirmer manuellement (AHM-53) — Directeur Financier/Admin. */
export function useCotisationsEnAttenteDePaiement() {
  return useQuery({
    queryKey: cotisationsKeys.enAttenteDePaiement(),
    queryFn: () => cotisationsApi.listCotisationsEnAttenteDePaiement(),
  });
}

export function useMarquerCotisationPayee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { mode_paiement?: ModePaiement } }) =>
      cotisationsApi.marquerCotisationPayee(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cotisationsKeys.all }),
  });
}

/** Échéances des relances par année (AHM-54) — Directeur Financier/Admin. */
export function useConfigurationsRelance() {
  return useQuery({
    queryKey: cotisationsKeys.configurationsRelance(),
    queryFn: () => cotisationsApi.listConfigurationsRelance(),
  });
}

export function useCreerConfigurationRelance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ConfigurationRelancePayload) =>
      cotisationsApi.creerConfigurationRelance(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.configurationsRelance() }),
  });
}

export function useModifierConfigurationRelance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { date_echeance: string } }) =>
      cotisationsApi.modifierConfigurationRelance(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.configurationsRelance() }),
  });
}

export function useSupprimerConfigurationRelance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cotisationsApi.supprimerConfigurationRelance(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.configurationsRelance() }),
  });
}
