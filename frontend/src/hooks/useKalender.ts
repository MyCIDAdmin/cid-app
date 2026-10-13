import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/kalender";
import type { Ansicht, TerminPayload } from "../types/kalender";

const keys = {
  all: ["kalender"] as const,
  zugang: ["kalender", "zugang"] as const,
  eintraege: (ansicht: string, von: number, bis: number) =>
    ["kalender", "eintraege", ansicht, von, bis] as const,
  termin: (id: string) => ["kalender", "termin", id] as const,
};

export function useKalenderZugang() {
  return useQuery({ queryKey: keys.zugang, queryFn: api.getZugang });
}

export function useKalenderEintraege(ansicht: Ansicht, von: Date, bis: Date, enabled = true) {
  return useQuery({
    queryKey: keys.eintraege(ansicht, von.getTime(), bis.getTime()),
    queryFn: () => api.listEintraege(ansicht, von, bis),
    enabled,
  });
}

export function useOeffentlicheEintraege(von: Date, bis: Date) {
  return useQuery({
    queryKey: keys.eintraege("oeffentlich", von.getTime(), bis.getTime()),
    queryFn: () => api.listOeffentlich(von, bis),
  });
}

export function useTermin(id: string | undefined) {
  return useQuery({
    queryKey: keys.termin(id ?? ""),
    queryFn: () => api.getTermin(id as string),
    enabled: Boolean(id),
  });
}

function useInvalidieren() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useTerminErstellen() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.terminErstellen, onSuccess: invalidieren });
}

export function useTerminVorschlagen() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.terminVorschlagen, onSuccess: invalidieren });
}

export function useTerminAendern() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TerminPayload> }) =>
      api.terminAendern(id, payload),
    onSuccess: invalidieren,
  });
}

export function useEintragAusblenden() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.eintragAusblenden, onSuccess: invalidieren });
}

export function useTerminLoeschen() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.terminLoeschen, onSuccess: invalidieren });
}

export function useTerminAktion() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({
      id,
      aktion,
    }: {
      id: string;
      aktion: "freigeben" | "ablehnen" | "ankuendigen";
    }) => api.terminAktion(id, aktion),
    onSuccess: invalidieren,
  });
}

export function useTerminAntworten() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({ id, antwort }: { id: string; antwort: "zusage" | "vielleicht" | "absage" }) =>
      api.terminAntworten(id, antwort),
    onSuccess: invalidieren,
  });
}

export function usePersonenSuche(q: string) {
  return useQuery({
    queryKey: ["kalender", "personen", q],
    queryFn: () => api.suchePersonen(q),
    enabled: q.trim().length >= 2,
  });
}

export function useDienste(filter: { termin?: string; evenement?: string }, enabled = true) {
  return useQuery({
    queryKey: ["kalender", "dienste", filter] as const,
    queryFn: () => api.listDienste(filter),
    enabled: enabled && Boolean(filter.termin || filter.evenement),
  });
}

export function useOffeneDienste() {
  return useQuery({
    queryKey: ["kalender", "dienste", "offen"] as const,
    queryFn: api.listOffeneDienste,
  });
}

export function useDienstVorschlaege(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["kalender", "dienste", "vorschlaege", id] as const,
    queryFn: () => api.dienstVorschlaege(id),
    enabled,
  });
}

export function useDienstErstellen() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.dienstErstellen, onSuccess: invalidieren });
}

export function useDienstAendern() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<import("../types/kalender").DienstPayload>;
    }) => api.dienstAendern(id, payload),
    onSuccess: invalidieren,
  });
}

export function useDienstLoeschen() {
  const invalidieren = useInvalidieren();
  return useMutation({ mutationFn: api.dienstLoeschen, onSuccess: invalidieren });
}

export function useDienstAktion() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({
      id,
      aktion,
      user,
    }: {
      id: string;
      aktion: "eintragen" | "austragen" | "zuweisen" | "entfernen";
      user?: string;
    }) => api.dienstAktion(id, aktion, user),
    onSuccess: invalidieren,
  });
}

export function useDienstAnschreiben() {
  return useMutation({
    mutationFn: ({ id, user }: { id: string; user: string }) => api.dienstAnschreiben(id, user),
  });
}
