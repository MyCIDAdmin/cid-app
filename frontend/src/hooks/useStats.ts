/**
 * Hooks React Query — module stats (Statistiques & KPIs, mockup #pg-stats, 3 onglets R1).
 */
import { useQuery } from "@tanstack/react-query";

import * as statsApi from "../api/stats";
import type { StatsFiltres } from "../types/stats";

const statsKeys = {
  all: ["stats"] as const,
  financier: (filtres: StatsFiltres) => [...statsKeys.all, "financier", filtres] as const,
  membres: (filtres: Pick<StatsFiltres, "ville" | "statut">) =>
    [...statsKeys.all, "membres", filtres] as const,
  evenements: (filtres: StatsFiltres) => [...statsKeys.all, "evenements", filtres] as const,
};

export function useStatsFinancier(filtres: StatsFiltres = {}) {
  return useQuery({
    queryKey: statsKeys.financier(filtres),
    queryFn: () => statsApi.getStatsFinancier(filtres),
  });
}

export function useStatsMembres(filtres: Pick<StatsFiltres, "ville" | "statut"> = {}) {
  return useQuery({
    queryKey: statsKeys.membres(filtres),
    queryFn: () => statsApi.getStatsMembres(filtres),
  });
}

export function useStatsEvenements(filtres: StatsFiltres = {}) {
  return useQuery({
    queryKey: statsKeys.evenements(filtres),
    queryFn: () => statsApi.getStatsEvenements(filtres),
  });
}
