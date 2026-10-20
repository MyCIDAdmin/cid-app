/** Hooks React Query — Zentrale Einstellungen (apps.zentral). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as zentralApi from "../api/zentral";
import type { ZentraleEinstellungenEingabe } from "../types/zentral";

const zentralKeys = {
  einstellungen: () => ["zentral", "einstellungen"] as const,
};

export function useZentraleEinstellungen() {
  return useQuery({
    queryKey: zentralKeys.einstellungen(),
    queryFn: () => zentralApi.getEinstellungen(),
  });
}

export function useAendereZentraleEinstellungen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ZentraleEinstellungenEingabe) => zentralApi.aendereEinstellungen(payload),
    onSuccess: (daten) => queryClient.setQueryData(zentralKeys.einstellungen(), daten),
  });
}
