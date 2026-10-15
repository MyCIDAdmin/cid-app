/** Hooks React Query — Support (Release 33). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/support";
import type {
  FaqEingabe,
  NachrichtEingabe,
  TicketAenderung,
  TicketEingabe,
  TicketFilter,
} from "../types/support";

const KEY = ["support"] as const;

export function useFaq() {
  return useQuery({ queryKey: [...KEY, "faq"], queryFn: api.getFaq });
}

export function useFaqVerwaltung(aktiv: boolean) {
  return useQuery({
    queryKey: [...KEY, "faq-verwaltung"],
    queryFn: api.getFaqVerwaltung,
    enabled: aktiv,
  });
}

export function useMeineTickets() {
  return useQuery({ queryKey: [...KEY, "meine"], queryFn: api.getMeineTickets });
}

export function useAlleTickets(filter: TicketFilter, aktiv: boolean) {
  return useQuery({
    queryKey: [...KEY, "alle", filter],
    queryFn: () => api.getAlleTickets(filter),
    enabled: aktiv,
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "ticket", id],
    queryFn: () => api.getTicket(id as number),
    enabled: id !== null,
  });
}

function useInvalidieren() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useFaqAnlegen() {
  const neu = useInvalidieren();
  return useMutation({ mutationFn: (e: FaqEingabe) => api.faqAnlegen(e), onSuccess: neu });
}

export function useFaqAendern() {
  const neu = useInvalidieren();
  return useMutation({
    mutationFn: ({ id, eingabe }: { id: number; eingabe: FaqEingabe }) =>
      api.faqAendern(id, eingabe),
    onSuccess: neu,
  });
}

export function useFaqLoeschen() {
  const neu = useInvalidieren();
  return useMutation({ mutationFn: (id: number) => api.faqLoeschen(id), onSuccess: neu });
}

export function useTicketEroeffnen() {
  const neu = useInvalidieren();
  return useMutation({ mutationFn: (e: TicketEingabe) => api.ticketEroeffnen(e), onSuccess: neu });
}

export function useTicketAendern(id: number) {
  const neu = useInvalidieren();
  return useMutation({
    mutationFn: (a: TicketAenderung) => api.ticketAendern(id, a),
    onSuccess: neu,
  });
}

export function useNachrichtSenden(id: number) {
  const neu = useInvalidieren();
  return useMutation({
    mutationFn: (e: NachrichtEingabe) => api.nachrichtSenden(id, e),
    onSuccess: neu,
  });
}
