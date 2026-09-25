/**
 * Client API — module stats (TDD §2.4, backend/apps/stats/views.py). Réservé Admin/DG/Bureau
 * Admin côté backend (StatsPermission) — voir RequireRole sur les routes correspondantes.
 */
import { apiClient } from "./client";
import type {
  FinanceRecord,
  KpisEvenements,
  KpisFinancier,
  KpisMembres,
  StatsFiltres,
  TypeTransaction,
} from "../types/stats";

export async function getStatsFinancier(filtres: StatsFiltres = {}): Promise<KpisFinancier> {
  const { data } = await apiClient.get<KpisFinancier>("/stats/financier/", { params: filtres });
  return data;
}

export async function getStatsMembres(
  filtres: Pick<
    StatsFiltres,
    "ville" | "statut" | "land" | "pays" | "date_adhesion_apres" | "date_adhesion_avant"
  > = {},
): Promise<KpisMembres> {
  const { data } = await apiClient.get<KpisMembres>("/stats/membres/", { params: filtres });
  return data;
}

export async function getStatsEvenements(filtres: StatsFiltres = {}): Promise<KpisEvenements> {
  const { data } = await apiClient.get<KpisEvenements>("/stats/evenements/", { params: filtres });
  return data;
}

/**
 * GET /stats/finances/ (ajouté le 2026-09-25, module "Statistiken & KPIs" : "Tab für alle
 * Finanzdaten (filterbar/sortierbar)"). Le tri (`tri`/`ordre`) côté backend n'est pas transmis
 * ici : le composant trie déjà côté client (DetailBoxTriable), même convention que
 * StatistiquesTab.tsx — évite un aller-retour réseau à chaque clic d'en-tête de colonne.
 */
export async function getStatsFinances(
  filtres: StatsFiltres & { type_transaction?: TypeTransaction } = {},
): Promise<{ results: FinanceRecord[] }> {
  const { data } = await apiClient.get<{ results: FinanceRecord[] }>("/stats/finances/", {
    params: filtres,
  });
  return data;
}

/** Nom de fichier suggéré par le serveur (Content-Disposition) — même repli que
 * boutiqueApi.exporterCommandesExcel (voir sa docstring). */
function nomFichierDepuisContentDisposition(contentDisposition: unknown, repli: string): string {
  const valeur = typeof contentDisposition === "string" ? contentDisposition : "";
  const correspondance = /filename="?([^"]+)"?/.exec(valeur);
  return correspondance?.[1] ?? repli;
}

/**
 * GET /stats/export/excel/ (demande utilisateur : "Export als PDF/Excel-Dashboard") — classeur
 * .xlsx (onglets KPIs + Finanzdaten), mêmes filtres que les 3 onglets/l'onglet Finanzdaten.
 */
export async function exporterStatsExcel(
  filtres: StatsFiltres = {},
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get("/stats/export/excel/", {
    params: filtres,
    responseType: "blob",
  });
  return {
    blob: data,
    nomFichier: nomFichierDepuisContentDisposition(
      headers["content-disposition"],
      "dashboard_stats.xlsx",
    ),
  };
}

/** GET /stats/export/pdf/ — résumé PDF du dashboard, mêmes filtres. */
export async function exporterStatsPdf(filtres: StatsFiltres = {}): Promise<Blob> {
  const { data } = await apiClient.get("/stats/export/pdf/", {
    params: filtres,
    responseType: "blob",
  });
  return data;
}
