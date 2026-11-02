import type {
  Bekanntmachung,
  FreigabeAntwort,
  Kandidatur,
  KandidaturPayload,
  Wahl,
  WahlPayload,
  Aufbewahrung,
  EntscheidungArt,
  Pruefergebnis,
  Sprache,
  Waehlbarkeit,
  Amt,
  Kanal,
} from "../types/wahlen";
import { apiClient } from "./client";

const BASIS = "/wahlen";

export async function listWahlen(): Promise<Wahl[]> {
  const { data } = await apiClient.get<Wahl[]>(`${BASIS}/`);
  return data;
}

export async function getWahl(id: string): Promise<Wahl> {
  const { data } = await apiClient.get<Wahl>(`${BASIS}/${id}/`);
  return data;
}

export async function wahlAnlegen(payload: WahlPayload): Promise<Wahl> {
  const { data } = await apiClient.post<Wahl>(`${BASIS}/`, payload);
  return data;
}

export async function wahlAendern(id: string, payload: Partial<WahlPayload>): Promise<Wahl> {
  const { data } = await apiClient.patch<Wahl>(`${BASIS}/${id}/`, payload);
  return data;
}

export async function wahlVeroeffentlichen(id: string): Promise<Wahl> {
  const { data } = await apiClient.post<Wahl>(`${BASIS}/${id}/veroeffentlichen/`);
  return data;
}

export async function ausschussHinzu(id: string, membre: string): Promise<Wahl> {
  const { data } = await apiClient.post<Wahl>(`${BASIS}/${id}/ausschuss/`, { membre });
  return data;
}

export async function ausschussWeg(id: string, membre: string): Promise<Wahl> {
  const { data } = await apiClient.delete<Wahl>(`${BASIS}/${id}/ausschuss/${membre}/`);
  return data;
}

export async function aufbewahrungSetzen(id: string, aufbewahrung: Aufbewahrung): Promise<Wahl> {
  const { data } = await apiClient.post<Wahl>(`${BASIS}/${id}/aufbewahrung/`, { aufbewahrung });
  return data;
}

export async function freigabeGeben(
  id: string,
  art: "oeffnen" | "schliessen",
): Promise<FreigabeAntwort> {
  const { data } = await apiClient.post<FreigabeAntwort>(`${BASIS}/${id}/freigabe/`, { art });
  return data;
}

export async function waehlbarkeitPruefen(
  id: string,
  membre: string,
  amt: Amt,
): Promise<Waehlbarkeit & { name: string }> {
  const { data } = await apiClient.get(`${BASIS}/${id}/waehlbarkeit/`, {
    params: { membre, amt },
  });
  return data;
}

// ---- Kandidaturen

export async function listKandidaturen(wahl: string): Promise<Kandidatur[]> {
  const { data } = await apiClient.get<Kandidatur[]>(`${BASIS}/kandidaturen/`, {
    params: { wahl },
  });
  return data;
}

export async function getKandidatur(id: string): Promise<Kandidatur> {
  const { data } = await apiClient.get<Kandidatur>(`${BASIS}/kandidaturen/${id}/`);
  return data;
}

export async function kandidaturAnlegen(wahl: string): Promise<Kandidatur> {
  const { data } = await apiClient.post<Kandidatur>(`${BASIS}/kandidaturen/`, { wahl });
  return data;
}

export async function kandidaturAendern(
  id: string,
  payload: KandidaturPayload,
): Promise<Kandidatur> {
  const { data } = await apiClient.patch<Kandidatur>(`${BASIS}/kandidaturen/${id}/`, payload);
  return data;
}

export async function kandidaturFoto(id: string, person: string, foto: File): Promise<Kandidatur> {
  const form = new FormData();
  form.append("person", person);
  form.append("foto", foto);
  const { data } = await apiClient.post<Kandidatur>(`${BASIS}/kandidaturen/${id}/foto/`, form);
  return data;
}

export async function kandidaturNachweis(
  id: string,
  art: string,
  datei: File,
  person?: string,
): Promise<Kandidatur> {
  const form = new FormData();
  form.append("art", art);
  form.append("datei", datei);
  if (person) form.append("person", person);
  const { data } = await apiClient.post<Kandidatur>(`${BASIS}/kandidaturen/${id}/nachweis/`, form);
  return data;
}

export async function nachweisAnsehen(id: string, nachweis: string): Promise<{ url: string }> {
  const { data } = await apiClient.get(`${BASIS}/kandidaturen/${id}/nachweis/${nachweis}/`);
  return data;
}

export type KandidaturAktion = "unterstuetzen" | "einreichen" | "zurueckziehen";

export async function kandidaturAktion(id: string, aktion: KandidaturAktion): Promise<Kandidatur> {
  const { data } = await apiClient.post<Kandidatur>(`${BASIS}/kandidaturen/${id}/${aktion}/`);
  return data;
}

export async function pruefpunktSetzen(
  id: string,
  schluessel: string,
  ergebnis: Pruefergebnis,
  notiz = "",
): Promise<Kandidatur> {
  const { data } = await apiClient.post<Kandidatur>(`${BASIS}/kandidaturen/${id}/pruefpunkt/`, {
    schluessel,
    ergebnis,
    notiz,
  });
  return data;
}

export async function entscheidungVorschlagen(
  id: string,
  art: EntscheidungArt,
  begruendung = "",
  artikel = "",
): Promise<Kandidatur> {
  const { data } = await apiClient.post<Kandidatur>(`${BASIS}/kandidaturen/${id}/entscheidung/`, {
    art,
    begruendung,
    artikel,
  });
  return data;
}

export async function entscheidungAntwort(
  id: string,
  entscheidung: string,
  aktion: "zustimmen" | "verwerfen",
): Promise<Kandidatur> {
  const { data } = await apiClient.post<Kandidatur>(
    `${BASIS}/kandidaturen/${id}/entscheidung/${entscheidung}/${aktion}/`,
  );
  return data;
}

// ---- Bekanntmachungen

export async function listBekanntmachungen(wahl: string): Promise<Bekanntmachung[]> {
  const { data } = await apiClient.get<Bekanntmachung[]>(`${BASIS}/bekanntmachungen/`, {
    params: { wahl },
  });
  return data;
}

export interface BekanntmachungAenderung {
  sprache?: Sprache;
  betreff?: string;
  html?: string;
  kanaele?: Kanal[];
  versand_am?: string;
}

export async function bekanntmachungAendern(
  id: string,
  payload: BekanntmachungAenderung,
): Promise<Bekanntmachung> {
  const { data } = await apiClient.patch<Bekanntmachung>(
    `${BASIS}/bekanntmachungen/${id}/`,
    payload,
  );
  return data;
}

export type BekanntmachungAktion = "mustertext" | "vorlegen" | "freigeben" | "zurueck";

export async function bekanntmachungAktion(
  id: string,
  aktion: BekanntmachungAktion,
): Promise<Bekanntmachung> {
  const { data } = await apiClient.post<Bekanntmachung>(
    `${BASIS}/bekanntmachungen/${id}/${aktion}/`,
  );
  return data;
}

export async function bekanntmachungUebersetzen(
  id: string,
  sprache: Sprache,
): Promise<Bekanntmachung> {
  const { data } = await apiClient.post<Bekanntmachung>(
    `${BASIS}/bekanntmachungen/${id}/uebersetzen/`,
    { sprache },
  );
  return data;
}

export async function bekanntmachungGeprueft(
  id: string,
  sprache: Sprache,
  wert: boolean,
): Promise<Bekanntmachung> {
  const { data } = await apiClient.post<Bekanntmachung>(
    `${BASIS}/bekanntmachungen/${id}/geprueft/`,
    { sprache, wert },
  );
  return data;
}

export async function bekanntmachungAushang(id: string, sprache: Sprache): Promise<Blob> {
  const { data } = await apiClient.get(`${BASIS}/bekanntmachungen/${id}/aushang/`, {
    params: { sprache },
    responseType: "blob",
  });
  return data;
}
