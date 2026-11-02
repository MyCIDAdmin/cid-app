import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/wahlen";
import type {
  Aufbewahrung,
  EinspruchEntscheidung,
  EinspruchPayload,
  EntscheidungArt,
  FreigabeArt,
  KandidaturPayload,
  Pruefergebnis,
  ReglementArt,
  Sprache,
  WahlPayload,
} from "../types/wahlen";

const keys = {
  all: ["wahlen"] as const,
  detail: (id: string) => ["wahlen", "detail", id] as const,
  kandidaturen: (wahl: string) => ["wahlen", "kandidaturen", wahl] as const,
  bekanntmachungen: (wahl: string) => ["wahlen", "bekanntmachungen", wahl] as const,
  ergebnis: (wahl: string) => ["wahlen", "ergebnis", wahl] as const,
  protokoll: (wahl: string) => ["wahlen", "protokoll", wahl] as const,
  einsprueche: (wahl: string) => ["wahlen", "einsprueche", wahl] as const,
  beteiligung: (wahl: string) => ["wahlen", "beteiligung", wahl] as const,
  wahlzettel: (wahl: string) => ["wahlen", "wahlzettel", wahl] as const,
  uebergabe: (wahl: string) => ["wahlen", "uebergabe", wahl] as const,
  reglemente: (wahl: string) => ["wahlen", "reglemente", wahl] as const,
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

export function useErgebnis(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.ergebnis(wahl ?? ""),
    queryFn: () => api.getErgebnis(wahl as string),
    enabled: Boolean(wahl) && enabled,
  });
}

export function useProtokoll(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.protokoll(wahl ?? ""),
    queryFn: () => api.getProtokoll(wahl as string),
    enabled: Boolean(wahl) && enabled,
    retry: false,
  });
}

export function useEinsprueche(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.einsprueche(wahl ?? ""),
    queryFn: () => api.listEinsprueche(wahl as string),
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
      mutationFn: (art: FreigabeArt) => api.freigabeGeben(id, art),
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

export function useProtokollUnterschreiben(wahl: string) {
  const neuLaden = useAlleNeuLaden();
  return useMutation({ mutationFn: () => api.protokollUnterschreiben(wahl), onSuccess: neuLaden });
}

export function useEinspruchEinlegen() {
  const neuLaden = useAlleNeuLaden();
  return useMutation({
    mutationFn: (payload: EinspruchPayload) => api.einspruchEinlegen(payload),
    onSuccess: neuLaden,
  });
}

export function useEinspruchAktionen(id: string) {
  const neuLaden = useAlleNeuLaden();
  const optionen = { onSuccess: neuLaden };
  return {
    aktion: useMutation({
      mutationFn: (aktion: api.EinspruchAktion) => api.einspruchAktion(id, aktion),
      ...optionen,
    }),
    entscheiden: useMutation({
      mutationFn: ({ art, begruendung }: { art: EinspruchEntscheidung; begruendung: string }) =>
        api.einspruchEntscheiden(id, art, begruendung),
      ...optionen,
    }),
  };
}

export function useBeteiligung(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.beteiligung(wahl ?? ""),
    queryFn: () => api.getBeteiligung(wahl as string),
    enabled: Boolean(wahl) && enabled,
  });
}

export function useWahlzettel(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.wahlzettel(wahl ?? ""),
    queryFn: () => api.getWahlzettel(wahl as string),
    enabled: Boolean(wahl) && enabled,
    retry: false,
  });
}

export function useUebergabe(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.uebergabe(wahl ?? ""),
    queryFn: () => api.getUebergabe(wahl as string),
    enabled: Boolean(wahl) && enabled,
  });
}

export function useUebergabeSetzen(wahl: string) {
  const neuLaden = useAlleNeuLaden();
  return useMutation({
    mutationFn: (p: { schluessel: string; erledigt: boolean; notiz?: string }) =>
      api.uebergabeSetzen(wahl, p.schluessel, p.erledigt, p.notiz),
    onSuccess: neuLaden,
  });
}

export function useReglemente(wahl: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.reglemente(wahl ?? ""),
    queryFn: () => api.listReglemente(wahl as string),
    enabled: Boolean(wahl) && enabled,
  });
}

export function useReglementAnlegen(wahl: string) {
  const neuLaden = useAlleNeuLaden();
  return useMutation({
    mutationFn: (schluessel: ReglementArt) => api.reglementAnlegen(wahl, schluessel),
    onSuccess: neuLaden,
  });
}

export function useReglementAktionen(id: string) {
  const neuLaden = useAlleNeuLaden();
  const optionen = { onSuccess: neuLaden };
  return {
    aendern: useMutation({
      mutationFn: (payload: api.ReglementAenderung) => api.reglementAendern(id, payload),
      ...optionen,
    }),
    uebersetzen: useMutation({
      mutationFn: (sprache: Sprache) => api.reglementUebersetzen(id, sprache),
      ...optionen,
    }),
    geprueft: useMutation({
      mutationFn: ({ sprache, wert }: { sprache: Sprache; wert: boolean }) =>
        api.reglementGeprueft(id, sprache, wert),
      ...optionen,
    }),
    gelesen: useMutation({ mutationFn: () => api.reglementGelesen(id), ...optionen }),
  };
}
