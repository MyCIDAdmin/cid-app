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
export const useStandortLoeschen = () => useAenderung(api.loescheStandort);
