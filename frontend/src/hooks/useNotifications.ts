/**
 * Hooks React Query — module notifications (cloche du layout, voir
 * components/layout/NotificationBell).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as notificationsApi from "../api/notifications";
import type { ParametresNotification } from "../types/notification";

const notificationsKeys = {
  all: ["notifications"] as const,
  liste: (filtres: notificationsApi.NotificationsFiltres = {}) =>
    [...notificationsKeys.all, "liste", filtres] as const,
  nonLuesCount: () => [...notificationsKeys.all, "non-lues-count"] as const,
  parametres: () => [...notificationsKeys.all, "parametres"] as const,
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

/**
 * Notifications non lues (première page, 20 max — voir NotificationsCursorPagination côté
 * backend) — sert au point d'activité par module de la sidebar (ajouté le 2026-09-16, voir
 * components/layout/Sidebar) : chaque item compare son `to` au `lien` de ces notifications,
 * même mécanisme de polling léger que useNonLuesCount.
 */
export function useNotificationsNonLues() {
  return useQuery({
    queryKey: notificationsKeys.liste({ lu: false }),
    queryFn: () => notificationsApi.listNotifications({ lu: false }),
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

export function useMarquerLuesPrefixe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefixe: string) => notificationsApi.marquerLuesPrefixe(prefixe),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

/** Activation/désactivation des emails de notification par module (Administrateur App). */
export function useParametresNotification() {
  return useQuery({
    queryKey: notificationsKeys.parametres(),
    queryFn: () => notificationsApi.getParametresNotification(),
  });
}

export function useModifierParametresNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ParametresNotification>) =>
      notificationsApi.modifierParametresNotification(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKeys.parametres() }),
  });
}
