/** Hooks React Query — Fähigkeiten-Datenbank (Release 9). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/faehigkeiten";
import type { FaehigkeitenFilter, MeineFaehigkeit } from "../types/faehigkeiten";

const keys = {
  katalog: ["membres", "faehigkeiten", "katalog"] as const,
  meine: ["membres", "faehigkeiten", "meine"] as const,
  bericht: (f: FaehigkeitenFilter) => ["membres", "faehigkeiten", "bericht", f] as const,
};

export function useFaehigkeitenKatalog() {
  return useQuery({ queryKey: keys.katalog, queryFn: api.getFaehigkeitenKatalog });
}

export function useMeineFaehigkeiten() {
  return useQuery({ queryKey: keys.meine, queryFn: api.getMeineFaehigkeiten });
}

export function useErstelleFaehigkeit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.erstelleFaehigkeit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.katalog }),
  });
}

export function useSpeichereMeineFaehigkeiten() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (faehigkeiten: MeineFaehigkeit[]) => api.speichereMeineFaehigkeiten(faehigkeiten),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["membres", "faehigkeiten"] }),
  });
}

export function useFaehigkeitenBericht(f: FaehigkeitenFilter, enabled = true) {
  return useQuery({
    queryKey: keys.bericht(f),
    queryFn: () => api.getFaehigkeitenBericht(f),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useLoescheFaehigkeit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loescheFaehigkeit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["membres", "faehigkeiten"] }),
  });
}
