/** Hooks React Query — Aktivität (Release 20). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as aktivitaetApi from "../api/aktivitaet";
import type { AuffaelligkeitStatus, JournalFilter } from "../types/aktivitaet";

const keys = {
  all: ["aktivitaet"] as const,
  uebersicht: (tage: number) => [...keys.all, "uebersicht", tage] as const,
  journal: (filter: JournalFilter) => [...keys.all, "journal", filter] as const,
  aktionen: () => [...keys.all, "aktionen"] as const,
  nutzung: (tage: number) => [...keys.all, "nutzung", tage] as const,
  auffaelligkeiten: (status: AuffaelligkeitStatus) =>
    [...keys.all, "auffaelligkeiten", status] as const,
};

export function useUebersicht(tage: number) {
  return useQuery({
    queryKey: keys.uebersicht(tage),
    queryFn: () => aktivitaetApi.getUebersicht(tage),
    placeholderData: keepPreviousData,
  });
}

export function useJournal(filter: JournalFilter) {
  return useQuery({
    queryKey: keys.journal(filter),
    queryFn: () => aktivitaetApi.getJournal(filter),
    placeholderData: keepPreviousData,
  });
}

export function useAktionen() {
  return useQuery({
    queryKey: keys.aktionen(),
    queryFn: aktivitaetApi.getAktionen,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAuffaelligkeiten(status: AuffaelligkeitStatus) {
  return useQuery({
    queryKey: keys.auffaelligkeiten(status),
    queryFn: () => aktivitaetApi.getAuffaelligkeiten(status),
    placeholderData: keepPreviousData,
  });
}

export function useAuffaelligkeitErledigen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aktivitaetApi.erledigeAuffaelligkeit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useNutzung(tage: number) {
  return useQuery({
    queryKey: keys.nutzung(tage),
    queryFn: () => aktivitaetApi.getNutzung(tage),
    placeholderData: keepPreviousData,
  });
}
