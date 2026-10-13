import type { AntwortEingabe, Umfrage, UmfragePayload, UmfrageErgebnisse } from "../types/umfragen";
import i18n from "../i18n";
import { apiClient } from "./client";

export async function listUmfragen(): Promise<Umfrage[]> {
  const { data } = await apiClient.get<Umfrage[]>("/umfragen/");
  return data;
}

export async function getUmfrage(id: string): Promise<Umfrage> {
  const { data } = await apiClient.get<Umfrage>(`/umfragen/${id}/`);
  return data;
}

export async function umfrageErstellen(payload: UmfragePayload): Promise<Umfrage> {
  const { data } = await apiClient.post<Umfrage>("/umfragen/", payload);
  return data;
}

export async function umfrageAendern(
  id: string,
  payload: Partial<UmfragePayload>,
): Promise<Umfrage> {
  const { data } = await apiClient.patch<Umfrage>(`/umfragen/${id}/`, payload);
  return data;
}

export async function umfrageLoeschen(id: string): Promise<void> {
  await apiClient.delete(`/umfragen/${id}/`);
}

export async function umfrageAktion(
  id: string,
  aktion: "veroeffentlichen" | "zurueckziehen" | "ankuendigen",
): Promise<Umfrage> {
  const { data } = await apiClient.post<Umfrage>(`/umfragen/${id}/${aktion}/`);
  return data;
}

export async function umfrageBildSetzen(id: string, datei: File): Promise<Umfrage> {
  const form = new FormData();
  form.append("bild", datei);
  const { data } = await apiClient.post<Umfrage>(`/umfragen/${id}/bild/`, form);
  return data;
}

export async function umfrageBildEntfernen(id: string): Promise<Umfrage> {
  const { data } = await apiClient.delete<Umfrage>(`/umfragen/${id}/bild/`);
  return data;
}

export async function umfrageTeilnehmen(id: string, antworten: AntwortEingabe[]): Promise<void> {
  await apiClient.post(`/umfragen/${id}/teilnehmen/`, { antworten });
}

export async function umfrageErgebnisse(id: string): Promise<UmfrageErgebnisse> {
  const { data } = await apiClient.get<UmfrageErgebnisse>(`/umfragen/${id}/ergebnisse/`);
  return data;
}

/** PDF-Bericht mit Diagrammen (Release 13) in der Oberflächensprache (de/fr, sonst Deutsch). */
export async function umfrageBericht(id: string): Promise<Blob> {
  const { data } = await apiClient.get(`/umfragen/${id}/bericht/`, {
    params: { lang: i18n.language?.startsWith("fr") ? "fr" : "de" },
    responseType: "blob",
  });
  return data;
}

/** Excel-Export der Ergebnisse (Release 14) in der Oberflächensprache (de/fr, sonst Deutsch). */
export async function umfrageExcel(id: string): Promise<Blob> {
  const { data } = await apiClient.get(`/umfragen/${id}/excel/`, {
    params: { lang: i18n.language?.startsWith("fr") ? "fr" : "de" },
    responseType: "blob",
  });
  return data;
}
