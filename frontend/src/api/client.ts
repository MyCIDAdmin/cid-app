/**
 * Client Axios avec auto-refresh JWT transparent (E-013 du RICEFW, SCD §3.4).
 * Intercepte les 401 sur requête authentifiée, tente un refresh unique,
 * puis rejoue la requête originale. En cas d'échec du refresh -> logout.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "../store/authStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const apiClient = axios.create({ baseURL: API_BASE_URL });

/** Das Token darf nur an die eigene API gehen — nie an absolute Fremd-URLs (z. B. `next`-Links). */
function istApiAnfrage(config: InternalAxiosRequestConfig): boolean {
  try {
    const ziel = new URL(apiClient.getUri(config), window.location.origin);
    return ziel.origin === new URL(API_BASE_URL, window.location.origin).origin;
  } catch {
    return false;
  }
}

apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken && istApiAnfrage(config)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    throw new Error("Pas de refresh token disponible.");
  }
  try {
    const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
      refresh: refreshToken,
    });
    // Bug corrigé le 2026-09-28 (retour utilisateur : "warum ich [...] manchmal rausgekickt
    // [werde]") : SIMPLE_JWT tourne avec ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION
    // (voir config.settings.base) — chaque refresh invalide l'ANCIEN refresh token et en
    // renvoie un NOUVEAU dans `data.refresh`. Réutiliser l'ancien `refreshToken` ici (comme
    // avant ce correctif) fonctionnait une seule fois : au refresh suivant (~15 min plus
    // tard, ACCESS_TOKEN_LIFETIME), le token déjà blacklisté était rejeté -> logout() —
    // exactement le symptôme "angemeldet bleiben coché, mais manchmal ausgeloggt".
    setTokens(data.access, data.refresh);
    return data.access as string;
  } catch (err) {
    // Nur bei abgelehntem Token ausloggen — bei Netzwerk-/Serverfehlern bleibt die Sitzung bestehen.
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 400 || status === 401 || status === 403) logout();
    throw err;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken();
        const newAccess = await refreshPromise;
        refreshPromise = null;
        original.headers.Authorization = `Bearer ${newAccess}`;
        return apiClient(original);
      } catch (refreshError) {
        refreshPromise = null;
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);
