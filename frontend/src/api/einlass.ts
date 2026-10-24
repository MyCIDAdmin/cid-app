/** Client API — Einlass (backend/apps/eintritt, einlass_views). */
import { apiClient } from "./client";
import type {
  EinlassAntwort,
  EinlassBuchung,
  EinlassHelfer,
  EinlassTyp,
  EinlassUebersicht,
  EinlassZiel,
  PruefErgebnis,
  PersonStand,
} from "../types/einlass";

const BASIS = "/eintritt/einlass";

export async function getMeinEinlass(): Promise<EinlassZiel[]> {
  const { data } = await apiClient.get<{ ergebnisse: EinlassZiel[] }>(`${BASIS}/meine/`);
  return data.ergebnisse;
}

export async function getEinlass(typ: EinlassTyp, id: string): Promise<EinlassUebersicht> {
  const { data } = await apiClient.get<EinlassUebersicht>(`${BASIS}/${typ}/${id}/`);
  return data;
}

export async function einlassPruefen(
  typ: EinlassTyp,
  id: string,
  code: string,
): Promise<PruefErgebnis> {
  const { data } = await apiClient.post<PruefErgebnis>(`${BASIS}/${typ}/${id}/pruefen/`, { code });
  return data;
}

export async function einlassBuchen(
  typ: EinlassTyp,
  id: string,
  buchung: EinlassBuchung,
): Promise<EinlassAntwort> {
  const { data } = await apiClient.post<EinlassAntwort>(
    `${BASIS}/${typ}/${id}/einlassen/`,
    buchung,
  );
  return data;
}

export async function einlassRuecknahme(einlassId: string): Promise<PersonStand> {
  const { data } = await apiClient.post<{ stand: PersonStand }>(
    `${BASIS}/ruecknahme/${einlassId}/`,
  );
  return data.stand;
}

export async function getHelfer(typ: EinlassTyp, id: string): Promise<EinlassHelfer[]> {
  const { data } = await apiClient.get<{ ergebnisse: EinlassHelfer[] }>(
    `${BASIS}/${typ}/${id}/helfer/`,
  );
  return data.ergebnisse;
}

export async function helferBenennen(
  typ: EinlassTyp,
  id: string,
  email: string,
): Promise<EinlassHelfer[]> {
  const { data } = await apiClient.post<{ ergebnisse: EinlassHelfer[] }>(
    `${BASIS}/${typ}/${id}/helfer/`,
    { email },
  );
  return data.ergebnisse;
}

export async function helferEntfernen(
  typ: EinlassTyp,
  id: string,
  helferId: string,
): Promise<EinlassHelfer[]> {
  const { data } = await apiClient.delete<{ ergebnisse: EinlassHelfer[] }>(
    `${BASIS}/${typ}/${id}/helfer/${helferId}/`,
  );
  return data.ergebnisse;
}

export async function exportAnwesenheit(
  typ: EinlassTyp,
  id: string,
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get(`${BASIS}/${typ}/${id}/export/`, {
    responseType: "blob",
  });
  const passt = /filename="?([^";]+)"?/.exec(String(headers["content-disposition"] ?? ""));
  return { blob: data, nomFichier: passt?.[1] ?? "anwesenheit.xlsx" };
}
