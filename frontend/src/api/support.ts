/** Client API — Support (Release 33), backend/apps/support/views.py. */
import type {
  FaqEingabe,
  FaqEintrag,
  NachrichtEingabe,
  Ticket,
  TicketAenderung,
  TicketDetail,
  TicketEingabe,
  TicketFilter,
} from "../types/support";
import { apiClient } from "./client";

export async function getFaq(): Promise<FaqEintrag[]> {
  const { data } = await apiClient.get<FaqEintrag[]>("/support/faq/");
  return data;
}

export async function getFaqVerwaltung(): Promise<FaqEintrag[]> {
  const { data } = await apiClient.get<FaqEintrag[]>("/support/faq/verwaltung/");
  return data;
}

export async function faqAnlegen(eingabe: FaqEingabe): Promise<FaqEintrag> {
  const { data } = await apiClient.post<FaqEintrag>("/support/faq/", eingabe);
  return data;
}

export async function faqAendern(id: number, eingabe: FaqEingabe): Promise<FaqEintrag> {
  const { data } = await apiClient.patch<FaqEintrag>(`/support/faq/${id}/`, eingabe);
  return data;
}

export async function faqLoeschen(id: number): Promise<void> {
  await apiClient.delete(`/support/faq/${id}/`);
}

export async function getMeineTickets(): Promise<Ticket[]> {
  const { data } = await apiClient.get<Ticket[]>("/support/tickets/");
  return data;
}

export async function getAlleTickets(filter: TicketFilter): Promise<Ticket[]> {
  const params: Record<string, string> = { alle: "1" };
  if (filter.status !== "alle") params.status = filter.status;
  if (filter.q.trim()) params.q = filter.q.trim();
  const { data } = await apiClient.get<Ticket[]>("/support/tickets/", { params });
  return data;
}

export async function getTicket(id: number): Promise<TicketDetail> {
  const { data } = await apiClient.get<TicketDetail>(`/support/tickets/${id}/`);
  return data;
}

export async function ticketEroeffnen(eingabe: TicketEingabe): Promise<TicketDetail> {
  const { data } = await apiClient.post<TicketDetail>("/support/tickets/", eingabe);
  return data;
}

export async function ticketAendern(id: number, aenderung: TicketAenderung): Promise<TicketDetail> {
  const { data } = await apiClient.patch<TicketDetail>(`/support/tickets/${id}/`, aenderung);
  return data;
}

export async function nachrichtSenden(
  id: number,
  eingabe: NachrichtEingabe,
): Promise<TicketDetail> {
  const { data } = await apiClient.post<TicketDetail>(
    `/support/tickets/${id}/nachrichten/`,
    eingabe,
  );
  return data;
}
