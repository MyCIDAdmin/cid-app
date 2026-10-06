/**
 * Client API — module stats (TDD §2.4, backend/apps/stats/views.py). Réservé Admin/DG/Bureau
 * Admin côté backend (StatsPermission) — voir RequireRole sur les routes correspondantes.
 */
import { apiClient } from "./client";
import type {
  Bilan,
  FinanceRecord,
  KpisEvenements,
  KpisFinancier,
  KpisMembres,
  KpisProjets,
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
  filtres: StatsFiltres & { type_transaction?: TypeTransaction; mois?: number } = {},
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

/** GET /stats/bilan/ — Jahresbilanz de l'association (sans filtres membre). */
export async function getStatsBilan(annee: number): Promise<Bilan> {
  const { data } = await apiClient.get<Bilan>("/stats/bilan/", { params: { annee } });
  return data;
}

export async function exporterBilanExcel(
  annee: number,
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get("/stats/export/bilan-excel/", {
    params: { annee },
    responseType: "blob",
  });
  return {
    blob: data,
    nomFichier: nomFichierDepuisContentDisposition(
      headers["content-disposition"],
      `jahresbilanz_${annee}.xlsx`,
    ),
  };
}

export async function exporterBilanPdf(annee: number): Promise<Blob> {
  const { data } = await apiClient.get("/stats/export/bilan-pdf/", {
    params: { annee },
    responseType: "blob",
  });
  return data;
}

/** CSV der Buchungen eines Jahres für den Steuerberater (Semikolon, Dezimalkomma, UTF-8 mit BOM). */
export async function exporterBuchungenCsv(annee: number): Promise<Blob> {
  const { data } = await apiClient.get("/stats/export/buchungen-csv/", {
    params: { annee },
    responseType: "blob",
  });
  return data;
}

export async function getStatsProjets(): Promise<KpisProjets> {
  const { data } = await apiClient.get<KpisProjets>("/stats/projets/");
  return data;
}
