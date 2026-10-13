import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/umfragen";
import type { AntwortEingabe, UmfragePayload } from "../types/umfragen";

const keys = {
  all: ["umfragen"] as const,
  detail: (id: string) => ["umfragen", "detail", id] as const,
  ergebnisse: (id: string) => ["umfragen", "ergebnisse", id] as const,
};

export function useUmfragen() {
  return useQuery({ queryKey: keys.all, queryFn: api.listUmfragen });
}

export function useUmfrage(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ""),
    queryFn: () => api.getUmfrage(id as string),
    enabled: Boolean(id),
  });
}

export function useUmfrageErgebnisse(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.ergebnisse(id ?? ""),
    queryFn: () => api.umfrageErgebnisse(id as string),
    enabled: Boolean(id) && enabled,
  });
}

function useInvalidieren() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useUmfrageErstellen() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.umfrageErstellen, onSuccess: invalidieren });
}

export function useUmfrageAendern() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<UmfragePayload> }) =>
      api.umfrageAendern(id, payload),
    onSuccess: invalidieren,
  });
}

export function useUmfrageLoeschen() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.umfrageLoeschen, onSuccess: invalidieren });
}

export function useUmfrageAktion() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({
      id,
      aktion,
    }: {
      id: string;
      aktion: "veroeffentlichen" | "zurueckziehen" | "ankuendigen";
    }) => api.umfrageAktion(id, aktion),
    onSuccess: invalidieren,
  });
}

export function useUmfrageBild() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({ id, datei }: { id: string; datei: File | null }) =>
      datei ? api.umfrageBildSetzen(id, datei) : api.umfrageBildEntfernen(id),
    onSuccess: invalidieren,
  });
}

export function useUmfrageTeilnehmen() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({ id, antworten }: { id: string; antworten: AntwortEingabe[] }) =>
      api.umfrageTeilnehmen(id, antworten),
    onSuccess: invalidieren,
  });
}
