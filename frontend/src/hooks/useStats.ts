/**
 * Hooks React Query — module stats (Statistiques & KPIs, mockup #pg-stats, 3 onglets R1).
 */
import { useQuery } from "@tanstack/react-query";

import * as statsApi from "../api/stats";
import type { PivotAbfrage, StatsFiltres, TypeTransaction } from "../types/stats";

type FiltresMembres = Pick<
  StatsFiltres,
  "ville" | "statut" | "land" | "pays" | "date_adhesion_apres" | "date_adhesion_avant"
>;

type FiltresFinances = StatsFiltres & { type_transaction?: TypeTransaction; mois?: number };

const statsKeys = {
  all: ["stats"] as const,
  financier: (filtres: StatsFiltres) => [...statsKeys.all, "financier", filtres] as const,
  membres: (filtres: FiltresMembres) => [...statsKeys.all, "membres", filtres] as const,
  projets: () => [...statsKeys.all, "projets"] as const,
  evenements: (filtres: StatsFiltres) => [...statsKeys.all, "evenements", filtres] as const,
  bilan: (annee: number) => [...statsKeys.all, "bilan", annee] as const,
  pivot: (abfrage: PivotAbfrage) => [...statsKeys.all, "pivot", abfrage] as const,
  pivotOptionen: (von: number, bis: number) =>
    [...statsKeys.all, "pivot-optionen", von, bis] as const,
  finances: (filtres: FiltresFinances) => [...statsKeys.all, "finances", filtres] as const,
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

export function useStatsMembres(filtres: FiltresMembres = {}, options: { enabled?: boolean } = {}) {
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

export function useStatsFinances(filtres: FiltresFinances = {}) {
  return useQuery({
    queryKey: statsKeys.finances(filtres),
    queryFn: () => statsApi.getStatsFinances(filtres),
  });
}

export function useStatsBilan(annee: number) {
  return useQuery({
    queryKey: statsKeys.bilan(annee),
    queryFn: () => statsApi.getStatsBilan(annee),
  });
}

export function useStatsProjets() {
  return useQuery({ queryKey: statsKeys.projets(), queryFn: () => statsApi.getStatsProjets() });
}

export function useStatsPivot(abfrage: PivotAbfrage) {
  return useQuery({
    queryKey: statsKeys.pivot(abfrage),
    queryFn: () => statsApi.getStatsPivot(abfrage),
  });
}

export function usePivotOptionen(jahrVon: number, jahrBis: number) {
  return useQuery({
    queryKey: statsKeys.pivotOptionen(jahrVon, jahrBis),
    queryFn: () => statsApi.getPivotOptionen(jahrVon, jahrBis),
  });
}
