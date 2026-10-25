/**
 * Öffentliche Beitragsaktion (ohne Anmeldung) — apps.cotisations.aktionen_oeffentlich.
 * Der Client sendet bewusst keinen Auth-Header nötig; der Endpunkt liefert nie Namen.
 */
import { apiClient } from "./client";
import type { AktionOeffentlich } from "../types/cotisation";

export async function getAktionOeffentlich(id: string): Promise<AktionOeffentlich> {
  const { data } = await apiClient.get<AktionOeffentlich>(`/aktionen/${id}/`);
  return data;
}

/**
 * Adresse, die in Social Media geteilt wird : die Vorschauseite des Servers (Open-Graph-Angaben
 * für WhatsApp, Facebook, X ...). Sie leitet Menschen zur App-Seite `/aktion/<id>` weiter.
 * Ohne konfigurierte API-Adresse (lokale Entwicklung) fällt sie auf die App-Seite zurück.
 */
export function teilenUrlDerAktion(id: string): string {
  const basis = (apiClient.defaults.baseURL ?? "").replace(/\/$/, "");
  return basis.startsWith("http")
    ? `${basis}/aktionen/${id}/teilen/`
    : `${window.location.origin}/aktion/${id}`;
}
