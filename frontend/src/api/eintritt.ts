/** Client API — Eintrittstickets (backend/apps/eintritt). */
import { apiClient } from "./client";
import type { MeineTicketsAntwort } from "../types/tickets";

export async function getMeineTickets(): Promise<MeineTicketsAntwort> {
  const { data } = await apiClient.get<MeineTicketsAntwort>("/eintritt/meine/");
  return data;
}

export async function ticketSenden(id: string): Promise<void> {
  await apiClient.post(`/eintritt/${id}/senden/`);
}

export async function ticketErneuern(id: string): Promise<void> {
  await apiClient.post(`/eintritt/${id}/erneuern/`);
}
