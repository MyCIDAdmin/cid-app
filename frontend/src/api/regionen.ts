/** Client API — Regionen (Release 26), backend/apps/regionen/views.py. */
import type {
  KarteDaten,
  Person,
  RegionAenderung,
  RegionDetail,
  RegionenListe,
  Standort,
  Verantwortlicher,
  Verwaltung,
  VerwaltungRegion,
} from "../types/regionen";
import { apiClient } from "./client";

export async function getRegionen(): Promise<RegionenListe> {
  const { data } = await apiClient.get<RegionenListe>("/regionen/");
  return data;
}

export async function getRegion(slug: string): Promise<RegionDetail> {
  const { data } = await apiClient.get<RegionDetail>(`/regionen/${slug}/`);
  return data;
}

export async function speichereBeschreibung(arg: {
  slug: string;
  de: string;
  fr: string;
}): Promise<RegionDetail> {
  const { data } = await apiClient.patch<RegionDetail>(`/regionen/${arg.slug}/`, {
    beschreibung_de: arg.de,
    beschreibung_fr: arg.fr,
  });
  return data;
}

export async function ladeBannerHoch(arg: { slug: string; datei: File }): Promise<RegionDetail> {
  const formData = new FormData();
  formData.append("banner", arg.datei);
  const { data } = await apiClient.post<RegionDetail>(`/regionen/${arg.slug}/banner/`, formData);
  return data;
}

export async function entferneBanner(slug: string): Promise<RegionDetail> {
  const { data } = await apiClient.delete<RegionDetail>(`/regionen/${slug}/banner/`);
  return data;
}

export async function sucheDurchPersonen(q: string): Promise<Person[]> {
  const { data } = await apiClient.get<{ ergebnisse: Person[] }>("/regionen/personen/", {
    params: { q },
  });
  return data.ergebnisse;
}

export async function weiseVerantwortlichenZu(arg: {
  slug: string;
  user: string;
  name?: string;
  funktion?: string;
  standort?: string | null;
}): Promise<Verantwortlicher> {
  const { slug, ...koerper } = arg;
  const { data } = await apiClient.post<Verantwortlicher>(
    `/regionen/${slug}/verantwortliche/`,
    koerper,
  );
  return data;
}

export async function speichereKarte(arg: {
  slug: string;
  id: string;
  daten: KarteDaten;
}): Promise<Verantwortlicher> {
  const { data } = await apiClient.patch<Verantwortlicher>(
    `/regionen/${arg.slug}/verantwortliche/${arg.id}/`,
    arg.daten,
  );
  return data;
}

export async function loescheKarte(arg: { slug: string; id: string }): Promise<void> {
  await apiClient.delete(`/regionen/${arg.slug}/verantwortliche/${arg.id}/`);
}

export async function ladeFotoHoch(arg: {
  slug: string;
  id: string;
  datei: File;
}): Promise<Verantwortlicher> {
  const formData = new FormData();
  formData.append("foto", arg.datei);
  const { data } = await apiClient.post<Verantwortlicher>(
    `/regionen/${arg.slug}/verantwortliche/${arg.id}/foto/`,
    formData,
  );
  return data;
}

export async function entferneFoto(arg: { slug: string; id: string }): Promise<Verantwortlicher> {
  const { data } = await apiClient.delete<Verantwortlicher>(
    `/regionen/${arg.slug}/verantwortliche/${arg.id}/foto/`,
  );
  return data;
}

// --- Struktur (nur App Admin) ---------------------------------------------------------------

export async function getVerwaltung(): Promise<Verwaltung> {
  const { data } = await apiClient.get<Verwaltung>("/regionen/verwaltung/");
  return data;
}

export async function legeRegionAn(arg: {
  name: string;
  farbe?: string;
}): Promise<VerwaltungRegion> {
  const { data } = await apiClient.post<VerwaltungRegion>("/regionen/verwaltung/", arg);
  return data;
}

export async function aendereRegion(arg: {
  id: string;
  daten: RegionAenderung;
}): Promise<VerwaltungRegion> {
  const { data } = await apiClient.patch<VerwaltungRegion>(
    `/regionen/verwaltung/${arg.id}/`,
    arg.daten,
  );
  return data;
}

export async function loescheRegion(id: string): Promise<void> {
  await apiClient.delete(`/regionen/verwaltung/${id}/`);
}

export async function setzeLaender(arg: {
  id: string;
  laender: string[];
}): Promise<VerwaltungRegion> {
  const { data } = await apiClient.put<VerwaltungRegion>(
    `/regionen/verwaltung/${arg.id}/laender/`,
    {
      laender: arg.laender,
    },
  );
  return data;
}

export async function legeStandortAn(arg: {
  regionId: string;
  name: string;
  land?: string;
}): Promise<Standort> {
  const { data } = await apiClient.post<Standort>(
    `/regionen/verwaltung/${arg.regionId}/standorte/`,
    { name: arg.name, land: arg.land ?? "" },
  );
  return data;
}

export async function loescheStandort(id: string): Promise<void> {
  await apiClient.delete(`/regionen/verwaltung/standorte/${id}/`);
}
