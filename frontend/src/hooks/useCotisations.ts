/**
 * Hooks React Query — module cotisations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as cotisationsApi from "../api/cotisations";
import type { CotisationCreatePayload, ModePaiement } from "../types/cotisation";

const cotisationsKeys = {
  all: ["cotisations"] as const,
  mesCotisations: () => [...cotisationsKeys.all, "mes-cotisations"] as const,
  enAttenteDePaiement: () => [...cotisationsKeys.all, "en-attente-paiement"] as const,
};

export function useMesCotisations() {
  return useQuery({
    queryKey: cotisationsKeys.mesCotisations(),
    queryFn: () => cotisationsApi.listMesCotisations(),
  });
}

export function useCreerCotisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CotisationCreatePayload) => cotisationsApi.creerCotisation(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cotisationsKeys.all }),
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
