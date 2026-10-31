/** Client API — Web-Push (Release 2026.11), backend/apps/notifications/push_views.py. */
import { apiClient } from "./client";

export interface PushGeraet {
  id: string;
  endpoint: string;
  geraet: string;
  created_at: string;
  zuletzt_zugestellt: string | null;
}

export interface PushZustand {
  aktiv: boolean;
  schluessel: string;
  geraete: PushGeraet[];
  kategorien: string[];
  verfuegbar: string[];
}

export interface PushAboDaten {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function getPush(): Promise<PushZustand> {
  const { data } = await apiClient.get<PushZustand>("/notifications/push/");
  return data;
}

export async function pushAnmelden(abo: PushAboDaten): Promise<PushZustand> {
  const { data } = await apiClient.post<PushZustand>("/notifications/push/abo/", abo);
  return data;
}

export async function pushAbmelden(endpoint: string): Promise<void> {
  await apiClient.delete("/notifications/push/abo/", { data: { endpoint } });
}

export async function pushKategorien(kategorien: string[]): Promise<PushZustand> {
  const { data } = await apiClient.patch<PushZustand>("/notifications/push/", { kategorien });
  return data;
}

export async function pushTest(): Promise<void> {
  await apiClient.post("/notifications/push/test/");
}
