/** API — Mitglieder-Reporting (/membres/reporting/…, ab Rolle RH). */
import type {
  AktivitaetenReporting,
  MembreReportingFiltre,
  MitgliederReporting,
  ReportingAnsicht,
} from "../types/membreReporting";
import { apiClient } from "./client";

function params(f: MembreReportingFiltre) {
  return {
    q: f.q.trim() || undefined,
    statut: f.statut || undefined,
    pays: f.pays || undefined,
    land: f.land || undefined,
    ville: f.ville.trim() || undefined,
    date_adhesion_apres: f.date_adhesion_apres || undefined,
    date_adhesion_avant: f.date_adhesion_avant || undefined,
    historie_statut: f.historie_statut || undefined,
    historie_jahr: f.historie_jahr.trim() || undefined,
    typ: f.typ.length ? f.typ.join(",") : undefined,
    von: f.von || undefined,
    bis: f.bis || undefined,
    aktivitaet_status: f.aktivitaet_status || undefined,
    min_betrag: f.min_betrag.trim().replace(",", ".") || undefined,
    max_betrag: f.max_betrag.trim().replace(",", ".") || undefined,
    min_aktivitaeten: f.min_aktivitaeten.trim() || undefined,
    ohne_aktivitaet: f.ohne_aktivitaet ? "1" : undefined,
    sortierung: f.sortierung,
    membre: f.membre || undefined,
  };
}

export async function getMitgliederReporting(
  filtre: MembreReportingFiltre,
  page: number,
): Promise<MitgliederReporting> {
  const { data } = await apiClient.get<MitgliederReporting>("/membres/reporting/mitglieder/", {
    params: { ...params(filtre), page },
  });
  return data;
}

export async function getAktivitaetenReporting(
  filtre: MembreReportingFiltre,
  page: number,
): Promise<AktivitaetenReporting> {
  const { data } = await apiClient.get<AktivitaetenReporting>("/membres/reporting/aktivitaeten/", {
    params: { ...params(filtre), page },
  });
  return data;
}

export async function exportMembreReporting(
  ansicht: ReportingAnsicht,
  filtre: MembreReportingFiltre,
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get("/membres/reporting/export/", {
    params: { ...params(filtre), ansicht },
    responseType: "blob",
  });
  const treffer = /filename="?([^"]+)"?/.exec(String(headers["content-disposition"] ?? ""));
  return { blob: data, nomFichier: treffer?.[1] ?? `reporting_${ansicht}.xlsx` };
}
