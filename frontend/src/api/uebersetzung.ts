/**
 * Client API — app uebersetzung (backend/apps/uebersetzung/views.py) : gespeicherte
 * DeepL-Übersetzungen der Beschreibungstexte lesen, manuell korrigieren oder neu anstoßen.
 */
import { apiClient } from "./client";

export type UebersetzungSprache = "de" | "fr" | "ar";

export interface UebersetzungFeld {
  feld: string;
  original: string;
  html: boolean;
  sprachen: Record<UebersetzungSprache, { text: string; automatisch: boolean }>;
}

export interface UebersetzungDaten {
  aktiv: boolean;
  felder: UebersetzungFeld[];
}

export async function getUebersetzungen(modell: string, id: string): Promise<UebersetzungDaten> {
  const { data } = await apiClient.get<UebersetzungDaten>(`/uebersetzungen/${modell}/${id}/`);
  return data;
}

export async function speichereUebersetzung(
  modell: string,
  id: string,
  payload: { feld: string; sprache: UebersetzungSprache; text: string },
): Promise<UebersetzungDaten> {
  const { data } = await apiClient.put<UebersetzungDaten>(
    `/uebersetzungen/${modell}/${id}/`,
    payload,
  );
  return data;
}

export async function uebersetzeNeu(modell: string, id: string): Promise<UebersetzungDaten> {
  const { data } = await apiClient.post<UebersetzungDaten>(`/uebersetzungen/${modell}/${id}/neu/`);
  return data;
}
