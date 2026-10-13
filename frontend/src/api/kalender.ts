import type {
  Ansicht,
  KalenderEintrag,
  KalenderZugang,
  Person,
  Termin,
  TerminPayload,
} from "../types/kalender";
import { apiClient } from "./client";

export async function getZugang(): Promise<KalenderZugang> {
  const { data } = await apiClient.get<KalenderZugang>("/kalender/zugang/");
  return data;
}

export async function listEintraege(
  ansicht: Ansicht,
  von: Date,
  bis: Date,
): Promise<KalenderEintrag[]> {
  const { data } = await apiClient.get<KalenderEintrag[]>("/kalender/eintraege/", {
    params: { ansicht, von: von.toISOString(), bis: bis.toISOString() },
  });
  return data;
}

/** Ohne Anmeldung (öffentliche Seite) — bewusst ohne Token-Pflicht. */
export async function listOeffentlich(von: Date, bis: Date): Promise<KalenderEintrag[]> {
  const { data } = await apiClient.get<KalenderEintrag[]>("/kalender-oeffentlich/", {
    params: { von: von.toISOString(), bis: bis.toISOString() },
  });
  return data;
}

export async function getTermin(id: string): Promise<Termin> {
  const { data } = await apiClient.get<Termin>(`/kalender/termine/${id}/`);
  return data;
}

export async function terminErstellen(payload: TerminPayload): Promise<Termin> {
  const { data } = await apiClient.post<Termin>("/kalender/termine/", payload);
  return data;
}

export async function terminVorschlagen(payload: TerminPayload): Promise<Termin> {
  const { data } = await apiClient.post<Termin>("/kalender/termine/vorschlagen/", payload);
  return data;
}

export async function terminAendern(id: string, payload: Partial<TerminPayload>): Promise<Termin> {
  const { data } = await apiClient.patch<Termin>(`/kalender/termine/${id}/`, payload);
  return data;
}

export async function terminLoeschen(id: string): Promise<void> {
  await apiClient.delete(`/kalender/termine/${id}/`);
}

export async function terminAktion(
  id: string,
  aktion: "freigeben" | "ablehnen" | "ankuendigen",
): Promise<Termin> {
  const { data } = await apiClient.post<Termin>(`/kalender/termine/${id}/${aktion}/`);
  return data;
}

export async function terminAntworten(
  id: string,
  antwort: "zusage" | "vielleicht" | "absage",
): Promise<Termin> {
  const { data } = await apiClient.post<Termin>(`/kalender/termine/${id}/antworten/`, { antwort });
  return data;
}

export async function suchePersonen(q: string): Promise<Person[]> {
  const { data } = await apiClient.get<Person[]>("/kalender/termine/personen/", { params: { q } });
  return data;
}
