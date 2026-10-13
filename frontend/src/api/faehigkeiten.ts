/** API — Fähigkeiten-Datenbank (/membres/faehigkeiten/, /membres/mes-faehigkeiten/, Reporting). */
import type {
  Faehigkeit,
  FaehigkeitenBericht,
  FaehigkeitenFilter,
  FaehigkeitKategorie,
  MeineFaehigkeit,
} from "../types/faehigkeiten";
import { apiClient } from "./client";

export async function getFaehigkeitenKatalog(): Promise<Faehigkeit[]> {
  const { data } = await apiClient.get<{ ergebnisse: Faehigkeit[] }>("/membres/faehigkeiten/");
  return data.ergebnisse;
}

export async function erstelleFaehigkeit(payload: {
  bezeichnung: string;
  kategorie?: FaehigkeitKategorie;
}): Promise<Faehigkeit> {
  const { data } = await apiClient.post<Faehigkeit>("/membres/faehigkeiten/", payload);
  return data;
}

export async function loescheFaehigkeit(id: string): Promise<void> {
  await apiClient.delete(`/membres/faehigkeiten/${id}/`);
}

export async function getMeineFaehigkeiten(): Promise<MeineFaehigkeit[]> {
  const { data } = await apiClient.get<{ faehigkeiten: MeineFaehigkeit[] }>(
    "/membres/mes-faehigkeiten/",
  );
  return data.faehigkeiten;
}

export async function speichereMeineFaehigkeiten(
  faehigkeiten: MeineFaehigkeit[],
): Promise<MeineFaehigkeit[]> {
  const { data } = await apiClient.put<{ faehigkeiten: MeineFaehigkeit[] }>(
    "/membres/mes-faehigkeiten/",
    { faehigkeiten },
  );
  return data.faehigkeiten;
}

function params(f: FaehigkeitenFilter) {
  return {
    q: f.q.trim() || undefined,
    kategorie: f.kategorie || undefined,
    faehigkeit: f.faehigkeit || undefined,
    statut: f.statut || undefined,
    alle: f.alle ? "1" : undefined,
  };
}

export async function getFaehigkeitenBericht(f: FaehigkeitenFilter): Promise<FaehigkeitenBericht> {
  const { data } = await apiClient.get<FaehigkeitenBericht>("/membres/reporting/faehigkeiten/", {
    params: params(f),
  });
  return data;
}

export async function exportFaehigkeitenBericht(
  f: FaehigkeitenFilter,
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get("/membres/reporting/faehigkeiten/export/", {
    params: params(f),
    responseType: "blob",
  });
  const treffer = /filename="?([^"]+)"?/.exec(String(headers["content-disposition"] ?? ""));
  return { blob: data, nomFichier: treffer?.[1] ?? "faehigkeiten.xlsx" };
}
