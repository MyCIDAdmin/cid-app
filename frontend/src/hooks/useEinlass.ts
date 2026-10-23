/** Hooks React Query — Einlass. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as einlassApi from "../api/einlass";
import type { EinlassBuchung, EinlassTyp } from "../types/einlass";

const key = (typ: EinlassTyp, id: string) => ["einlass", typ, id] as const;

export function useMeinEinlass() {
  return useQuery({ queryKey: ["einlass", "meine"], queryFn: einlassApi.getMeinEinlass });
}

/** Die Übersicht wird alle 15 s neu geladen, damit mehrere Prüfer denselben Stand sehen. */
export function useEinlass(typ: EinlassTyp, id: string) {
  return useQuery({
    queryKey: key(typ, id),
    queryFn: () => einlassApi.getEinlass(typ, id),
    refetchInterval: 15000,
  });
}

export function useEinlassPruefen(typ: EinlassTyp, id: string) {
  return useMutation({ mutationFn: (code: string) => einlassApi.einlassPruefen(typ, id, code) });
}

export function useEinlassBuchen(typ: EinlassTyp, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (buchung: EinlassBuchung) => einlassApi.einlassBuchen(typ, id, buchung),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(typ, id) }),
  });
}

export function useEinlassRuecknahme(typ: EinlassTyp, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (einlassId: string) => einlassApi.einlassRuecknahme(einlassId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(typ, id) }),
  });
}

export function useEinlassHelfer(typ: EinlassTyp, id: string, aktiv: boolean) {
  const queryClient = useQueryClient();
  const helferKey = [...key(typ, id), "helfer"] as const;
  const liste = useQuery({
    queryKey: helferKey,
    queryFn: () => einlassApi.getHelfer(typ, id),
    enabled: aktiv,
  });
  const benennen = useMutation({
    mutationFn: (email: string) => einlassApi.helferBenennen(typ, id, email),
    onSuccess: (daten) => queryClient.setQueryData(helferKey, daten),
  });
  const entfernen = useMutation({
    mutationFn: (helferId: string) => einlassApi.helferEntfernen(typ, id, helferId),
    onSuccess: (daten) => queryClient.setQueryData(helferKey, daten),
  });
  return { liste, benennen, entfernen };
}
