/** Daten der Startseite nach der Anmeldung (Vorschlag B „Gemeinschaft“). */
import { useQuery } from "@tanstack/react-query";

import * as communauteApi from "../api/communaute";

export function useGemeinschaft() {
  return useQuery({
    queryKey: ["communaute", "gemeinschaft"],
    queryFn: () => communauteApi.getGemeinschaft(),
    staleTime: 60_000,
  });
}
