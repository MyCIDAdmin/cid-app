/**
 * Hooks React Query — module cotisations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as cotisationsApi from "../api/cotisations";
import type { CotisationCreatePayload } from "../types/cotisation";

const cotisationsKeys = {
  all: ["cotisations"] as const,
  mesCotisations: () => [...cotisationsKeys.all, "mes-cotisations"] as const,
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
