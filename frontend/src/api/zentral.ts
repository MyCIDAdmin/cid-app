/** Client API — Zentrale Einstellungen, backend/apps/zentral/views.py. */
import type { ZentraleEinstellungen, ZentraleEinstellungenEingabe } from "../types/zentral";
import { apiClient } from "./client";

export async function getEinstellungen(): Promise<ZentraleEinstellungen> {
  const { data } = await apiClient.get<ZentraleEinstellungen>("/zentral/einstellungen/");
  return data;
}

export async function aendereEinstellungen(
  payload: ZentraleEinstellungenEingabe,
): Promise<ZentraleEinstellungen> {
  const { data } = await apiClient.patch<ZentraleEinstellungen>("/zentral/einstellungen/", payload);
  return data;
}
