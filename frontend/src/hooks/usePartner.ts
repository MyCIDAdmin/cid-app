/** Hooks React Query — Business Partner & Lieferanten. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as partnerApi from "../api/partner";
import type {
  BewertungDaten,
  PartnerFiltre,
  PartnerKategorie,
  PartnerSchreibDaten,
  VerknuepfungDaten,
  ZielTyp,
} from "../types/partner";

const keys = {
  all: ["partner"] as const,
  liste: (f: PartnerFiltre) => [...keys.all, "liste", f] as const,
  detail: (id: string) => [...keys.all, "detail", id] as const,
  bewertungen: (id: string) => [...keys.all, "bewertungen", id] as const,
  kategorien: () => [...keys.all, "kategorien"] as const,
  ziele: (typ: ZielTyp, q: string) => [...keys.all, "ziele", typ, q] as const,
};

export function usePartnerListe(filtre: PartnerFiltre) {
  return useQuery({
    queryKey: keys.liste(filtre),
    queryFn: () => partnerApi.getPartnerListe(filtre),
  });
}

export function usePartner(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ""),
    queryFn: () => partnerApi.getPartner(id as string),
    enabled: !!id,
  });
}

export function useBewertungen(id: string) {
  return useQuery({ queryKey: keys.bewertungen(id), queryFn: () => partnerApi.getBewertungen(id) });
}

export function usePartnerKategorien() {
  return useQuery({ queryKey: keys.kategorien(), queryFn: () => partnerApi.getKategorien() });
}

export function useZiele(typ: ZielTyp, q: string) {
  return useQuery({ queryKey: keys.ziele(typ, q), queryFn: () => partnerApi.getZiele(typ, q) });
}

/** Jede Änderung eines Partners macht Listen und Detail ungültig (Kennzahlen stehen in beiden). */
function useInvalidieren() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useCreerPartner() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (daten: PartnerSchreibDaten) => partnerApi.creerPartner(daten),
    onSuccess: invalidieren,
  });
}

export function useAendernPartner(id: string) {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (daten: PartnerSchreibDaten) => partnerApi.aendernPartner(id, daten),
    onSuccess: invalidieren,
  });
}

export function useSetzeArchiv(id: string) {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (archivieren: boolean) => partnerApi.setzeArchiv(id, archivieren),
    onSuccess: invalidieren,
  });
}

export function useVerknuepfen(id: string) {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (daten: VerknuepfungDaten) => partnerApi.verknuepfen(id, daten),
    onSuccess: invalidieren,
  });
}

export function useLoescheVerknuepfung() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (verknuepfungId: string) => partnerApi.loescheVerknuepfung(verknuepfungId),
    onSuccess: invalidieren,
  });
}

export function useBewerten(id: string) {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (daten: BewertungDaten) => partnerApi.bewerten(id, daten),
    onSuccess: invalidieren,
  });
}

export function useLoescheBewertung() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (bewertungId: string) => partnerApi.loescheBewertung(bewertungId),
    onSuccess: invalidieren,
  });
}

export function useCreerKategorie() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: (daten: Pick<PartnerKategorie, "nom" | "nom_fr">) =>
      partnerApi.creerKategorie(daten),
    onSuccess: invalidieren,
  });
}

export function useAendernKategorie() {
  const invalidieren = useInvalidieren();
  return useMutation({
    mutationFn: ({
      id,
      daten,
    }: {
      id: string;
      daten: Partial<Pick<PartnerKategorie, "nom" | "nom_fr" | "actif">>;
    }) => partnerApi.aendernKategorie(id, daten),
    onSuccess: invalidieren,
  });
}
