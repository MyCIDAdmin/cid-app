/** Hooks React Query — Regionen (Release 26). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/regionen";

const KEY = ["regionen"] as const;

export function useRegionen() {
  return useQuery({ queryKey: [...KEY, "liste"], queryFn: api.getRegionen });
}

export function useRegion(slug: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "detail", slug],
    queryFn: () => api.getRegion(slug as string),
    enabled: Boolean(slug),
  });
}

export function usePersonenSuche(q: string) {
  return useQuery({
    queryKey: [...KEY, "personen", q],
    queryFn: () => api.sucheDurchPersonen(q),
    enabled: q.trim().length >= 2,
  });
}

export function useVerwaltung() {
  return useQuery({ queryKey: [...KEY, "verwaltung"], queryFn: api.getVerwaltung });
}

export function useBeitraege(slug: string | undefined, limit: number) {
  return useQuery({
    queryKey: [...KEY, "beitraege", slug, limit],
    queryFn: () => api.getBeitraege({ slug: slug as string, limit }),
    enabled: Boolean(slug),
  });
}

export function useVeranstaltungen(slug: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "veranstaltungen", slug],
    queryFn: () => api.getVeranstaltungen(slug as string),
    enabled: Boolean(slug),
  });
}

export function useZurFreigabe(aktiv: boolean) {
  return useQuery({
    queryKey: [...KEY, "freigabe"],
    queryFn: api.getZurFreigabe,
    enabled: aktiv,
  });
}

export function useTeilnehmer(slug: string, id: string, aktiv: boolean) {
  return useQuery({
    queryKey: [...KEY, "teilnehmer", slug, id],
    queryFn: () => api.getTeilnehmer({ slug, id }),
    enabled: aktiv,
  });
}

export function useFanOptionen() {
  return useQuery({ queryKey: [...KEY, "fan-optionen"], queryFn: api.getFanOptionen });
}

export function useFanProfil(aktiv: boolean) {
  return useQuery({
    queryKey: [...KEY, "fan-profil"],
    queryFn: api.getFanProfil,
    enabled: aktiv,
  });
}

export function useWettbewerb(saison?: string) {
  return useQuery({
    queryKey: [...KEY, "wettbewerb", saison ?? "aktuell"],
    queryFn: () => api.getWettbewerb(saison),
  });
}

export function useJournal(arg: {
  saison?: string;
  region?: string;
  offset: number;
  limit: number;
  aktiv: boolean;
}) {
  const { aktiv, ...rest } = arg;
  return useQuery({
    queryKey: [...KEY, "journal", rest],
    queryFn: () => api.getJournal(rest),
    enabled: aktiv,
  });
}

export function useFans(arg: {
  slug: string;
  q: string;
  art: string;
  limit: number;
  aktiv: boolean;
}) {
  const { aktiv, ...rest } = arg;
  return useQuery({
    queryKey: [...KEY, "fans", rest],
    queryFn: () => api.getFans({ ...rest, offset: 0 }),
    enabled: aktiv,
  });
}

export function useFanDetail(slug: string, userId: string | null) {
  return useQuery({
    queryKey: [...KEY, "fan", slug, userId],
    queryFn: () => api.getFanDetail({ slug, userId: userId as string }),
    enabled: Boolean(userId),
  });
}

export function useBericht(von: string, bis: string) {
  return useQuery({
    queryKey: [...KEY, "bericht", von, bis],
    queryFn: () => api.getBericht({ von, bis }),
    enabled: Boolean(von && bis && von <= bis),
  });
}

function useAenderung<A, R>(fn: (arg: A) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export const useBeschreibungSpeichern = () => useAenderung(api.speichereBeschreibung);
export const useBannerHochladen = () => useAenderung(api.ladeBannerHoch);
export const useBannerEntfernen = () => useAenderung(api.entferneBanner);
export const useVerantwortlichenZuweisen = () => useAenderung(api.weiseVerantwortlichenZu);
export const useKarteSpeichern = () => useAenderung(api.speichereKarte);
export const useKarteLoeschen = () => useAenderung(api.loescheKarte);
export const useFotoHochladen = () => useAenderung(api.ladeFotoHoch);
export const useFotoEntfernen = () => useAenderung(api.entferneFoto);
export const useRegionAnlegen = () => useAenderung(api.legeRegionAn);
export const useRegionAendern = () => useAenderung(api.aendereRegion);
export const useRegionLoeschen = () => useAenderung(api.loescheRegion);
export const useLaenderSetzen = () => useAenderung(api.setzeLaender);
export const useStandortAnlegen = () => useAenderung(api.legeStandortAn);
export const useStandortFuerRegionAnlegen = () => useAenderung(api.legeStandortFuerRegionAn);
export const useStandortLoeschen = () => useAenderung(api.loescheStandort);
export const useBeitragAnlegen = () => useAenderung(api.legeBeitragAn);
export const useBeitragAendern = () => useAenderung(api.aendereBeitrag);
export const useBeitragLoeschen = () => useAenderung(api.loescheBeitrag);
export const useBeitragBildHochladen = () => useAenderung(api.ladeBeitragBildHoch);
export const useBeitragBildEntfernen = () => useAenderung(api.entferneBeitragBild);
export const useBeitragAusblenden = () => useAenderung(api.blendeBeitragAus);
export const useReaktionSetzen = () => useAenderung(api.setzeReaktion);
export const useVeranstaltungAnlegen = () => useAenderung(api.legeVeranstaltungAn);
export const useVeranstaltungAendern = () => useAenderung(api.aendereVeranstaltung);
export const useVeranstaltungLoeschen = () => useAenderung(api.loescheVeranstaltung);
export const useVeranstaltungBild = () => useAenderung(api.ladeVeranstaltungBildHoch);
export const useVeranstaltungAktion = () => useAenderung(api.fuehreAktionAus);
export const useAnmeldungSetzen = () => useAenderung(api.setzeAnmeldung);
export const useAnwesenheitSetzen = () => useAenderung(api.setzeAnwesenheit);
export const useFanProfilAendern = () => useAenderung(api.aendereFanProfil);
export const useMitgliedWerden = () => useAenderung(api.werdeMitglied);
export const useKorrekturBuchen = () => useAenderung(api.bucheKorrektur);
export const useSaisonAnlegen = () => useAenderung(api.legeSaisonAn);
export const useSaisonAendern = () => useAenderung(api.aendereSaison);
export const useSaisonLoeschen = () => useAenderung(api.loescheSaison);
export const useSaisonEinfrieren = () => useAenderung(api.friereSaisonEin);
export const usePunkteNachbuchen = () => useAenderung(api.buchePunkteNach);
export const useRegelnSpeichern = () => useAenderung(api.speichereRegeln);
