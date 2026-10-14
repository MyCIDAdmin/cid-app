import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/kalender";
import type { BeschlussPayload } from "../api/kalender";
import type {
  Ansicht,
  StimmAntwort,
  Tagesordnungspunkt,
  TerminPayload,
  UmfragePayload,
} from "../types/kalender";

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

export function useKalenderEintraege(ansichten: Ansicht[], von: Date, bis: Date, enabled = true) {
  return useQuery({
    queryKey: keys.eintraege([...ansichten].sort().join(","), von.getTime(), bis.getTime()),
    queryFn: () => api.listEintraege(ansichten, von, bis),
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

// --- Sitzungsmodus (Release 18) ---

export function useSitzung(terminId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["kalender", "sitzung", terminId] as const,
    queryFn: () => api.getSitzung(terminId),
    enabled,
  });
}

function useSitzungMutation<V>(fn: (terminId: string, v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ terminId, v }: { terminId: string; v: V }) => fn(terminId, v),
    onSuccess: (_d, { terminId }) =>
      qc.invalidateQueries({ queryKey: ["kalender", "sitzung", terminId] }),
  });
}

export function useSitzungSpeichern() {
  return useSitzungMutation<{ tops?: Tagesordnungspunkt[]; protokoll?: string }>(
    api.speichereSitzung,
  );
}

export function useBeschlussErstellen() {
  return useSitzungMutation<BeschlussPayload>(api.beschlussErstellen);
}

export function useBeschlussLoeschen() {
  return useSitzungMutation<string>(api.beschlussLoeschen);
}

export function useBeschlussZuAufgabe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      terminId,
      beschlussId,
      ...payload
    }: {
      terminId: string;
      beschlussId: string;
      projekt?: string | null;
      verantwortlich?: string | null;
      frist?: string | null;
    }) => api.beschlussZuAufgabe(terminId, beschlussId, payload),
    onSuccess: (_d, { terminId }) =>
      qc.invalidateQueries({ queryKey: ["kalender", "sitzung", terminId] }),
  });
}

export function useProtokollVersenden() {
  return useSitzungMutation<undefined>((terminId) => api.protokollVersenden(terminId));
}

// --- Terminfindung (Release 18) ---

export function useUmfragen() {
  return useQuery({ queryKey: ["kalender", "umfragen"] as const, queryFn: api.listUmfragen });
}

function useUmfrageMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Entscheiden legt einen Termin an, daher auch den Kalender neu laden.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kalender"] }),
  });
}

export function useUmfrageErstellen() {
  return useUmfrageMutation((payload: UmfragePayload) => api.umfrageErstellen(payload));
}

export function useUmfrageAbstimmen() {
  return useUmfrageMutation(
    ({ id, stimmen }: { id: string; stimmen: Record<string, StimmAntwort> }) =>
      api.umfrageAbstimmen(id, stimmen),
  );
}

export function useUmfrageEntscheiden() {
  return useUmfrageMutation(({ id, option }: { id: string; option: string }) =>
    api.umfrageEntscheiden(id, option),
  );
}

export function useUmfrageAbbrechen() {
  return useUmfrageMutation((id: string) => api.umfrageAbbrechen(id));
}
