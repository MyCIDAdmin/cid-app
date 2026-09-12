/**
 * Client API — module notifications (TDD §2.4, backend/apps/notifications/views.py).
 * Lecture seule côté client — une notification n'est jamais créée/modifiée par un appel
 * client hormis le champ `lu` (marquer-lue / tout-marquer-lu), voir NotificationSerializer.
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type { Notification } from "../types/notification";

export interface NotificationsFiltres {
  lu?: boolean;
  cursor?: string;
}

/** GET /notifications/ — toujours scopé à request.user côté backend (IDOR). */
export async function listNotifications(
  filtres: NotificationsFiltres = {},
): Promise<CursorPage<Notification>> {
  const { data } = await apiClient.get<CursorPage<Notification>>("/notifications/notifications/", {
    params: filtres,
  });
  return data;
}

export async function marquerLue(id: string): Promise<Notification> {
  const { data } = await apiClient.post<Notification>(
    `/notifications/notifications/${id}/marquer-lue/`,
  );
  return data;
}

export async function toutMarquerLu(): Promise<{ marquees: number }> {
  const { data } = await apiClient.post<{ marquees: number }>(
    "/notifications/notifications/tout-marquer-lu/",
  );
  return data;
}

/** Compteur pour le badge de la cloche (layout React) — voir NotificationBell. */
export async function nonLuesCount(): Promise<{ count: number }> {
  const { data } = await apiClient.get<{ count: number }>(
    "/notifications/notifications/non-lues-count/",
  );
  return data;
}
