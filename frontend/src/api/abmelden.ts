/**
 * Meldet ab und widerruft das Refresh-Token serverseitig (`POST /auth/logout/`), damit ein
 * abgegriffenes Token nach dem Logout nicht weiter gültig bleibt (Sicherheitsprüfung 2026-10-07).
 * Der lokale Logout geschieht immer — ein Netzwerkfehler beim Widerruf blockiert ihn nicht.
 */
import { useAuthStore } from "../store/authStore";
import { apiClient } from "./client";

export function abmelden(): void {
  const { refreshToken, logout } = useAuthStore.getState();
  if (refreshToken) {
    void apiClient.post("/auth/logout/", { refresh: refreshToken }).catch(() => undefined);
  }
  logout();
}
