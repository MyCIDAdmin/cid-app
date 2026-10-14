import type {
  Ansicht,
  Dienst,
  DienstPayload,
  DienstVorschlag,
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

/** Eine oder mehrere Sichten kombiniert (Backend : `ansicht=verein,meine`). */
export async function listEintraege(
  ansichten: Ansicht[],
  von: Date,
  bis: Date,
): Promise<KalenderEintrag[]> {
  const { data } = await apiClient.get<KalenderEintrag[]>("/kalender/eintraege/", {
    params: { ansicht: ansichten.join(","), von: von.toISOString(), bis: bis.toISOString() },
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

export async function eintragAusblenden(payload: {
  quelle: string;
  objekt_id: string;
  ausgeblendet: boolean;
}): Promise<void> {
  await apiClient.post("/kalender/ausblenden/", payload);
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

export async function listDienste(filter: {
  termin?: string;
  evenement?: string;
}): Promise<Dienst[]> {
  const { data } = await apiClient.get<Dienst[]>("/kalender/dienste/", { params: filter });
  return data;
}

export async function listOffeneDienste(): Promise<Dienst[]> {
  const { data } = await apiClient.get<Dienst[]>("/kalender/dienste/offen/");
  return data;
}

export async function dienstErstellen(payload: DienstPayload): Promise<Dienst> {
  const { data } = await apiClient.post<Dienst>("/kalender/dienste/", payload);
  return data;
}

export async function dienstAendern(id: string, payload: Partial<DienstPayload>): Promise<Dienst> {
  const { data } = await apiClient.patch<Dienst>(`/kalender/dienste/${id}/`, payload);
  return data;
}

export async function dienstLoeschen(id: string): Promise<void> {
  await apiClient.delete(`/kalender/dienste/${id}/`);
}

export async function dienstAktion(
  id: string,
  aktion: "eintragen" | "austragen" | "zuweisen" | "entfernen",
  user?: string,
): Promise<Dienst> {
  const { data } = await apiClient.post<Dienst>(
    `/kalender/dienste/${id}/${aktion}/`,
    user ? { user } : undefined,
  );
  return data;
}

export async function dienstVorschlaege(id: string): Promise<DienstVorschlag[]> {
  const { data } = await apiClient.get<DienstVorschlag[]>(`/kalender/dienste/${id}/vorschlaege/`);
  return data;
}

export async function dienstAnschreiben(id: string, user: string): Promise<void> {
  await apiClient.post(`/kalender/dienste/${id}/anschreiben/`, { user });
}
