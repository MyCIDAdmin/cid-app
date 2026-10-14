/** Client API — Regionen (Release 26), backend/apps/regionen/views.py. */
import type {
  Beitrag,
  BeitraegeListe,
  KarteDaten,
  Person,
  ReaktionsArt,
  RegionAenderung,
  RegionDetail,
  RegionenListe,
  Standort,
  Teilnehmer,
  Veranstaltung,
  VeranstaltungAktion,
  VeranstaltungEingabe,
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

// --- Beiträge und Reaktionen (Release 27) ---------------------------------------------------

export async function getBeitraege(arg: { slug: string; limit: number }): Promise<BeitraegeListe> {
  const { data } = await apiClient.get<BeitraegeListe>(`/regionen/${arg.slug}/beitraege/`, {
    params: { limit: arg.limit },
  });
  return data;
}

export async function legeBeitragAn(arg: {
  slug: string;
  titel: string;
  text: string;
  bild?: File | null;
}): Promise<Beitrag> {
  const { data } = await apiClient.post<Beitrag>(`/regionen/${arg.slug}/beitraege/`, {
    titel: arg.titel,
    text: arg.text,
  });
  if (!arg.bild) return data;
  return ladeBeitragBildHoch({ slug: arg.slug, id: data.id, datei: arg.bild });
}

export async function aendereBeitrag(arg: {
  slug: string;
  id: string;
  titel: string;
  text: string;
}): Promise<Beitrag> {
  const { data } = await apiClient.patch<Beitrag>(`/regionen/${arg.slug}/beitraege/${arg.id}/`, {
    titel: arg.titel,
    text: arg.text,
  });
  return data;
}

export async function loescheBeitrag(arg: { slug: string; id: string }): Promise<void> {
  await apiClient.delete(`/regionen/${arg.slug}/beitraege/${arg.id}/`);
}

export async function ladeBeitragBildHoch(arg: {
  slug: string;
  id: string;
  datei: File;
}): Promise<Beitrag> {
  const formData = new FormData();
  formData.append("bild", arg.datei);
  const { data } = await apiClient.post<Beitrag>(
    `/regionen/${arg.slug}/beitraege/${arg.id}/bild/`,
    formData,
  );
  return data;
}

export async function entferneBeitragBild(arg: { slug: string; id: string }): Promise<Beitrag> {
  const { data } = await apiClient.delete<Beitrag>(
    `/regionen/${arg.slug}/beitraege/${arg.id}/bild/`,
  );
  return data;
}

export async function blendeBeitragAus(arg: {
  slug: string;
  id: string;
  ausgeblendet: boolean;
  grund?: string;
}): Promise<Beitrag> {
  const { slug, id, ...koerper } = arg;
  const { data } = await apiClient.post<Beitrag>(
    `/regionen/${slug}/beitraege/${id}/ausblenden/`,
    koerper,
  );
  return data;
}

export async function setzeReaktion(arg: {
  slug: string;
  id: string;
  art: ReaktionsArt;
  aktiv: boolean;
}): Promise<void> {
  const { slug, id, ...koerper } = arg;
  await apiClient.put(`/regionen/${slug}/beitraege/${id}/reaktion/`, koerper);
}

// --- Regionale Veranstaltungen (Release 28) -------------------------------------------------

export async function getVeranstaltungen(slug: string): Promise<Veranstaltung[]> {
  const { data } = await apiClient.get<{ ergebnisse: Veranstaltung[] }>(
    `/regionen/${slug}/veranstaltungen/`,
  );
  return data.ergebnisse;
}

export async function getZurFreigabe(): Promise<Veranstaltung[]> {
  const { data } = await apiClient.get<{ ergebnisse: Veranstaltung[] }>(
    "/regionen/veranstaltungen/zur-freigabe/",
  );
  return data.ergebnisse;
}

export async function legeVeranstaltungAn(arg: {
  slug: string;
  daten: VeranstaltungEingabe;
  bild?: File | null;
}): Promise<Veranstaltung> {
  const { data } = await apiClient.post<Veranstaltung>(
    `/regionen/${arg.slug}/veranstaltungen/`,
    arg.daten,
  );
  if (!arg.bild) return data;
  return ladeVeranstaltungBildHoch({ slug: arg.slug, id: data.id, datei: arg.bild });
}

export async function aendereVeranstaltung(arg: {
  slug: string;
  id: string;
  daten: VeranstaltungEingabe;
}): Promise<Veranstaltung> {
  const { data } = await apiClient.patch<Veranstaltung>(
    `/regionen/${arg.slug}/veranstaltungen/${arg.id}/`,
    arg.daten,
  );
  return data;
}

export async function loescheVeranstaltung(arg: { slug: string; id: string }): Promise<void> {
  await apiClient.delete(`/regionen/${arg.slug}/veranstaltungen/${arg.id}/`);
}

export async function ladeVeranstaltungBildHoch(arg: {
  slug: string;
  id: string;
  datei: File;
}): Promise<Veranstaltung> {
  const formData = new FormData();
  formData.append("bild", arg.datei);
  const { data } = await apiClient.post<Veranstaltung>(
    `/regionen/${arg.slug}/veranstaltungen/${arg.id}/bild/`,
    formData,
  );
  return data;
}

export async function fuehreAktionAus(arg: {
  slug: string;
  id: string;
  aktion: VeranstaltungAktion;
  grund?: string;
}): Promise<Veranstaltung> {
  const { slug, id, ...koerper } = arg;
  const { data } = await apiClient.post<Veranstaltung>(
    `/regionen/${slug}/veranstaltungen/${id}/aktion/`,
    koerper,
  );
  return data;
}

export async function setzeAnmeldung(arg: {
  slug: string;
  id: string;
  aktiv: boolean;
}): Promise<Veranstaltung> {
  const { data } = await apiClient.put<Veranstaltung>(
    `/regionen/${arg.slug}/veranstaltungen/${arg.id}/anmeldung/`,
    { aktiv: arg.aktiv },
  );
  return data;
}

export async function getTeilnehmer(arg: { slug: string; id: string }): Promise<Teilnehmer[]> {
  const { data } = await apiClient.get<{ ergebnisse: Teilnehmer[] }>(
    `/regionen/${arg.slug}/veranstaltungen/${arg.id}/teilnehmer/`,
  );
  return data.ergebnisse;
}

export async function setzeAnwesenheit(arg: {
  slug: string;
  id: string;
  user: string;
  anwesend: boolean;
}): Promise<Teilnehmer> {
  const { data } = await apiClient.put<Teilnehmer>(
    `/regionen/${arg.slug}/veranstaltungen/${arg.id}/teilnehmer/${arg.user}/`,
    { anwesend: arg.anwesend },
  );
  return data;
}
