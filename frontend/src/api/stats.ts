/**
 * Client API — module stats (TDD §2.4, backend/apps/stats/views.py). Réservé Admin/DG/Bureau
 * Admin côté backend (StatsPermission) — voir RequireRole sur les routes correspondantes.
 */
import { apiClient } from "./client";
import type { KpisEvenements, KpisFinancier, KpisMembres, StatsFiltres } from "../types/stats";

export async function getStatsFinancier(filtres: StatsFiltres = {}): Promise<KpisFinancier> {
  const { data } = await apiClient.get<KpisFinancier>("/stats/financier/", { params: filtres });
  return data;
}

export async function getStatsMembres(
  filtres: Pick<StatsFiltres, "ville" | "statut"> = {},
): Promise<KpisMembres> {
  const { data } = await apiClient.get<KpisMembres>("/stats/membres/", { params: filtres });
  return data;
}

export async function getStatsEvenements(filtres: StatsFiltres = {}): Promise<KpisEvenements> {
  const { data } = await apiClient.get<KpisEvenements>("/stats/evenements/", { params: filtres });
  return data;
}
