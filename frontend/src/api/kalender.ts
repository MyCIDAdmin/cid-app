import type {
  Ansicht,
  Beschluss,
  Dienst,
  DienstPayload,
  DienstVorschlag,
  KalenderEintrag,
  KalenderZugang,
  Person,
  Sitzung,
  StimmAntwort,
  Tagesordnungspunkt,
  Termin,
  TerminPayload,
  Terminumfrage,
  UmfragePayload,
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

// --- Sitzungsmodus (Release 18) ---

export async function getSitzung(terminId: string): Promise<Sitzung> {
  const { data } = await apiClient.get<Sitzung>(`/kalender/termine/${terminId}/sitzung/`);
  return data;
}

export async function speichereSitzung(
  terminId: string,
  payload: { tops?: Tagesordnungspunkt[]; protokoll?: string },
): Promise<Sitzung> {
  const { data } = await apiClient.put<Sitzung>(`/kalender/termine/${terminId}/sitzung/`, payload);
  return data;
}

export interface BeschlussPayload {
  text: string;
  verantwortlich?: string | null;
  frist?: string | null;
}

export async function beschlussErstellen(
  terminId: string,
  payload: BeschlussPayload,
): Promise<Beschluss> {
  const { data } = await apiClient.post<Beschluss>(
    `/kalender/termine/${terminId}/sitzung/beschluesse/`,
    payload,
  );
  return data;
}

export async function beschlussLoeschen(terminId: string, beschlussId: string): Promise<void> {
  await apiClient.delete(`/kalender/termine/${terminId}/sitzung/beschluesse/${beschlussId}/`);
}

export async function beschlussZuAufgabe(
  terminId: string,
  beschlussId: string,
  payload: { projekt?: string | null; verantwortlich?: string | null; frist?: string | null },
): Promise<Beschluss> {
  const { data } = await apiClient.post<Beschluss>(
    `/kalender/termine/${terminId}/sitzung/beschluesse/${beschlussId}/aufgabe/`,
    payload,
  );
  return data;
}

export async function protokollVersenden(terminId: string): Promise<{ versendet_an: number }> {
  const { data } = await apiClient.post<{ versendet_an: number }>(
    `/kalender/termine/${terminId}/sitzung/versenden/`,
  );
  return data;
}

// --- Terminfindung (Release 18) ---

export async function listUmfragen(): Promise<Terminumfrage[]> {
  const { data } = await apiClient.get<Terminumfrage[]>("/kalender/terminumfragen/");
  return data;
}

export async function umfrageErstellen(payload: UmfragePayload): Promise<Terminumfrage> {
  const { data } = await apiClient.post<Terminumfrage>("/kalender/terminumfragen/", payload);
  return data;
}

export async function umfrageAbstimmen(
  id: string,
  stimmen: Record<string, StimmAntwort>,
): Promise<Terminumfrage> {
  const { data } = await apiClient.post<Terminumfrage>(
    `/kalender/terminumfragen/${id}/abstimmen/`,
    {
      stimmen,
    },
  );
  return data;
}

export async function umfrageEntscheiden(id: string, option: string): Promise<Terminumfrage> {
  const { data } = await apiClient.post<Terminumfrage>(
    `/kalender/terminumfragen/${id}/entscheiden/`,
    { option },
  );
  return data;
}

export async function umfrageAbbrechen(id: string): Promise<Terminumfrage> {
  const { data } = await apiClient.delete<Terminumfrage>(`/kalender/terminumfragen/${id}/`);
  return data;
}
