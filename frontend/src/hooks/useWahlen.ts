import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/wahlen";
import type {
  Aufbewahrung,
  EntscheidungArt,
  KandidaturPayload,
  Pruefergebnis,
  Sprache,
  WahlPayload,
} from "../types/wahlen";

const keys = {
  all: ["wahlen"] as const,
  detail: (id: string) => ["wahlen", "detail", id] as const,
  kandidaturen: (wahl: string) => ["wahlen", "kandidaturen", wahl] as const,
  bekanntmachungen: (wahl: string) => ["wahlen", "bekanntmachungen", wahl] as const,
};

export function useWahlen() {
  return useQuery({ queryKey: keys.all, queryFn: api.listWahlen });
}

export function useWahl(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ""),
    queryFn: () => api.getWahl(id as string),
    enabled: Boolean(id),
  });
}

export function useKandidaturen(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.kandidaturen(wahl ?? ""),
    queryFn: () => api.listKandidaturen(wahl as string),
    enabled: Boolean(wahl) && enabled,
  });
}

export function useBekanntmachungen(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.bekanntmachungen(wahl ?? ""),
    queryFn: () => api.listBekanntmachungen(wahl as string),
    enabled: Boolean(wahl) && enabled,
  });
}

/** Nach jeder Änderung alles zum Modul neu laden: die Zustände hängen voneinander ab. */
function useAlleNeuLaden() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useWahlAnlegen() {
  const neuLaden = useAlleNeuLaden();
  return useMutation({
    mutationFn: (payload: WahlPayload) => api.wahlAnlegen(payload),
    onSuccess: neuLaden,
  });
}

export function useWahlAktion(id: string) {
  const neuLaden = useAlleNeuLaden();
  return {
    veroeffentlichen: useMutation({
      mutationFn: () => api.wahlVeroeffentlichen(id),
      onSuccess: neuLaden,
    }),
    ausschussHinzu: useMutation({
      mutationFn: (membre: string) => api.ausschussHinzu(id, membre),
      onSuccess: neuLaden,
    }),
    ausschussWeg: useMutation({
      mutationFn: (membre: string) => api.ausschussWeg(id, membre),
      onSuccess: neuLaden,
    }),
    aufbewahrung: useMutation({
      mutationFn: (wert: Aufbewahrung) => api.aufbewahrungSetzen(id, wert),
      onSuccess: neuLaden,
    }),
    freigabe: useMutation({
      mutationFn: (art: "oeffnen" | "schliessen") => api.freigabeGeben(id, art),
      onSuccess: neuLaden,
    }),
  };
}

export function useKandidaturAnlegen() {
  const neuLaden = useAlleNeuLaden();
  return useMutation({
    mutationFn: (wahl: string) => api.kandidaturAnlegen(wahl),
    onSuccess: neuLaden,
  });
}

export function useKandidaturAktionen(id: string) {
  const neuLaden = useAlleNeuLaden();
  const optionen = { onSuccess: neuLaden };
  return {
    aendern: useMutation({
      mutationFn: (payload: KandidaturPayload) => api.kandidaturAendern(id, payload),
      ...optionen,
    }),
    foto: useMutation({
      mutationFn: ({ person, foto }: { person: string; foto: File }) =>
        api.kandidaturFoto(id, person, foto),
      ...optionen,
    }),
    nachweis: useMutation({
      mutationFn: ({ art, datei, person }: { art: string; datei: File; person?: string }) =>
        api.kandidaturNachweis(id, art, datei, person),
      ...optionen,
    }),
    aktion: useMutation({
      mutationFn: (aktion: api.KandidaturAktion) => api.kandidaturAktion(id, aktion),
      ...optionen,
    }),
    pruefpunkt: useMutation({
      mutationFn: ({ schluessel, ergebnis }: { schluessel: string; ergebnis: Pruefergebnis }) =>
        api.pruefpunktSetzen(id, schluessel, ergebnis),
      ...optionen,
    }),
    entscheidung: useMutation({
      mutationFn: (e: { art: EntscheidungArt; begruendung?: string; artikel?: string }) =>
        api.entscheidungVorschlagen(id, e.art, e.begruendung, e.artikel),
      ...optionen,
    }),
    entscheidungAntwort: useMutation({
      mutationFn: ({ eid, aktion }: { eid: string; aktion: "zustimmen" | "verwerfen" }) =>
        api.entscheidungAntwort(id, eid, aktion),
      ...optionen,
    }),
  };
}

export function useBekanntmachungAktionen(id: string) {
  const neuLaden = useAlleNeuLaden();
  const optionen = { onSuccess: neuLaden };
  return {
    aendern: useMutation({
      mutationFn: (payload: api.BekanntmachungAenderung) => api.bekanntmachungAendern(id, payload),
      ...optionen,
    }),
    aktion: useMutation({
      mutationFn: (aktion: api.BekanntmachungAktion) => api.bekanntmachungAktion(id, aktion),
      ...optionen,
    }),
    uebersetzen: useMutation({
      mutationFn: (sprache: Sprache) => api.bekanntmachungUebersetzen(id, sprache),
      ...optionen,
    }),
    geprueft: useMutation({
      mutationFn: ({ sprache, wert }: { sprache: Sprache; wert: boolean }) =>
        api.bekanntmachungGeprueft(id, sprache, wert),
      ...optionen,
    }),
  };
}
