/** Hooks React Query — Eintrittstickets. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as eintrittApi from "../api/eintritt";

const ticketsKey = ["eintritt", "meine"] as const;

export function useMeineTickets() {
  return useQuery({ queryKey: ticketsKey, queryFn: eintrittApi.getMeineTickets });
}

export function useTicketSenden() {
  return useMutation({ mutationFn: (id: string) => eintrittApi.ticketSenden(id) });
}

export function useTicketErneuern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eintrittApi.ticketErneuern(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketsKey }),
  });
}
