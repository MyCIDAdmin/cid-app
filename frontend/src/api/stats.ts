/**
 * Client API — module stats (TDD §2.4, backend/apps/stats/views.py). Réservé Admin/DG/Bureau
 * Admin côté backend (StatsPermission) — voir RequireRole sur les routes correspondantes.
 */
import i18n from "../i18n";
import { apiClient } from "./client";
import type {
  Bilan,
  FinanceRecord,
  KpisEvenements,
  KpisFinancier,
  KpisMembres,
  KpisProjets,
  PivotAbfrage,
  PivotErgebnis,
  PivotOptionen,
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

/** Sprache der Berichte (PDF/Excel/CSV): Oberflächensprache de/fr, sonst Deutsch. */
function berichtSprache(): "de" | "fr" {
  return i18n.language?.startsWith("fr") ? "fr" : "de";
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
    params: { ...filtres, langue: berichtSprache() },
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
    params: { ...filtres, langue: berichtSprache() },
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
    params: { annee, langue: berichtSprache() },
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
    params: { annee, langue: berichtSprache() },
    responseType: "blob",
  });
  return data;
}

/** CSV der Buchungen eines Jahres für den Steuerberater (Semikolon, Dezimalkomma, UTF-8 mit BOM). */
export async function exporterBuchungenCsv(annee: number): Promise<Blob> {
  const { data } = await apiClient.get("/stats/export/buchungen-csv/", {
    params: { annee, langue: berichtSprache() },
    responseType: "blob",
  });
  return data;
}

export async function getStatsProjets(): Promise<KpisProjets> {
  const { data } = await apiClient.get<KpisProjets>("/stats/projets/");
  return data;
}

function pivotParams(abfrage: PivotAbfrage) {
  return {
    zeilen: abfrage.zeilen.join(","),
    spalten: abfrage.spalten.length ? abfrage.spalten.join(",") : undefined,
    kennzahlen: abfrage.kennzahlen.join(","),
    jahr_von: abfrage.jahr_von,
    jahr_bis: abfrage.jahr_bis,
    f_typ: abfrage.typ || undefined,
    f_kategorie: abfrage.kategorie.length ? abfrage.kategorie.join(",") : undefined,
    f_gegenpartei: abfrage.gegenpartei.trim() || undefined,
    langue: berichtSprache(),
  };
}

/** GET /stats/pivot/optionen/ — Auswahlwerte der Pivot-Filter im gewählten Zeitraum. */
export async function getPivotOptionen(jahrVon: number, jahrBis: number): Promise<PivotOptionen> {
  const { data } = await apiClient.get<PivotOptionen>("/stats/pivot/optionen/", {
    params: { jahr_von: jahrVon, jahr_bis: jahrBis, langue: berichtSprache() },
  });
  return data;
}

/** GET /stats/pivot/ — dynamische Auswertung der Buchungen nach frei gewählten Dimensionen. */
export async function getStatsPivot(abfrage: PivotAbfrage): Promise<PivotErgebnis> {
  const { data } = await apiClient.get<PivotErgebnis>("/stats/pivot/", {
    params: pivotParams(abfrage),
  });
  return data;
}

/** GET /stats/export/pivot/ — dieselbe Auswertung als Excel- oder CSV-Datei. */
export async function exporterPivot(
  abfrage: PivotAbfrage,
  datei: "xlsx" | "csv",
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get("/stats/export/pivot/", {
    params: { ...pivotParams(abfrage), datei },
    responseType: "blob",
  });
  return {
    blob: data,
    nomFichier: nomFichierDepuisContentDisposition(
      headers["content-disposition"],
      `pivot.${datei}`,
    ),
  };
}
