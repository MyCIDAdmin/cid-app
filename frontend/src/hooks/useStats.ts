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

export function useStatsFinancier(filtres: StatsFiltres = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: statsKeys.financier(filtres),
    queryFn: () => statsApi.getStatsFinancier(filtres),
    // `enabled` (utilisé par DashboardPage) : StatsPermission réserve ces endpoints à Bureau
    // Admin+ côté API (403 sinon) — un rôle en dessous ne doit même pas déclencher la requête.
    enabled: options.enabled,
  });
}

export function useStatsMembres(
  filtres: Pick<StatsFiltres, "ville" | "statut"> = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: statsKeys.membres(filtres),
    queryFn: () => statsApi.getStatsMembres(filtres),
    enabled: options.enabled,
  });
}

export function useStatsEvenements(filtres: StatsFiltres = {}) {
  return useQuery({
    queryKey: statsKeys.evenements(filtres),
    queryFn: () => statsApi.getStatsEvenements(filtres),
  });
}
