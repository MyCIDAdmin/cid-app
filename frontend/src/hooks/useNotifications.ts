/**
 * Hooks React Query — module notifications (cloche du layout, voir
 * components/layout/NotificationBell).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as notificationsApi from "../api/notifications";

const notificationsKeys = {
  all: ["notifications"] as const,
  liste: (filtres: notificationsApi.NotificationsFiltres = {}) =>
    [...notificationsKeys.all, "liste", filtres] as const,
  nonLuesCount: () => [...notificationsKeys.all, "non-lues-count"] as const,
};

export function useNotifications(filtres: notificationsApi.NotificationsFiltres = {}) {
  return useQuery({
    queryKey: notificationsKeys.liste(filtres),
    queryFn: () => notificationsApi.listNotifications(filtres),
  });
}

/** Polling léger (60s) pour le badge de la cloche — pas de WebSocket dédié pour ce module. */
export function useNonLuesCount() {
  return useQuery({
    queryKey: notificationsKeys.nonLuesCount(),
    queryFn: () => notificationsApi.nonLuesCount(),
    refetchInterval: 60_000,
  });
}

function invalidateNotifications(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
}

export function useMarquerLue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.marquerLue(id),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

export function useToutMarquerLu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.toutMarquerLu(),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}
