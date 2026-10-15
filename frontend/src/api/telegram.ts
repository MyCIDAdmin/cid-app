/** Client API — Telegram und Geburtstagsgruß (Release 32), backend/apps/notifications. */
import { apiClient } from "./client";

export interface TelegramZustand {
  aktiv: boolean;
  bot: string;
  verbunden: boolean;
  verknuepft_am: string | null;
  kategorien: string[];
  verfuegbar: string[];
}

export async function getTelegram(): Promise<TelegramZustand> {
  const { data } = await apiClient.get<TelegramZustand>("/notifications/telegram/");
  return data;
}

export async function telegramVerbinden(): Promise<{ link: string; gueltig_bis: string }> {
  const { data } = await apiClient.post<{ link: string; gueltig_bis: string }>(
    "/notifications/telegram/verbinden/",
  );
  return data;
}

export async function telegramKategorien(kategorien: string[]): Promise<TelegramZustand> {
  const { data } = await apiClient.patch<TelegramZustand>("/notifications/telegram/", {
    kategorien,
  });
  return data;
}

export async function telegramTrennen(): Promise<void> {
  await apiClient.delete("/notifications/telegram/");
}

export async function telegramTest(): Promise<void> {
  await apiClient.post("/notifications/telegram/test/");
}
