/**
 * Store d'authentification Zustand (TDD §1, PPS Sprint 3-4).
 * Persistance en localStorage OU sessionStorage selon "Rester connecté"
 * (AHM-50) — accès/refresh JWT, profil utilisateur. ATTENTION :
 * localStorage/sessionStorage sont vulnérables XSS, compensé par CSP
 * stricte côté backend (SCD §3.4) — ne jamais y stocker de donnée
 * sensible en plus.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

const AUTH_STORAGE_KEY = "cid-auth";
const REMEMBER_ME_KEY = "cid-remember-me";

/**
 * "Rester connecté" décoché → sessionStorage (effacé à la fermeture du
 * navigateur) ; coché (comportement historique, par défaut) → localStorage
 * (survit à un redémarrage). Le choix lui-même est stocké dans une petite
 * clé localStorage séparée, lue de façon synchrone par le storage engine
 * ci-dessous à chaque lecture/écriture de l'état persistant.
 */
function isRememberMeEnabled(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ME_KEY) !== "0";
  } catch {
    return true;
  }
}

/** À appeler avant loginSuccess() — migre l'état déjà écrit si besoin. */
export function setRememberMe(remember: boolean) {
  try {
    const source = remember ? sessionStorage : localStorage;
    const target = remember ? localStorage : sessionStorage;
    const existing = source.getItem(AUTH_STORAGE_KEY);
    if (existing) {
      target.setItem(AUTH_STORAGE_KEY, existing);
      source.removeItem(AUTH_STORAGE_KEY);
    }
    localStorage.setItem(REMEMBER_ME_KEY, remember ? "1" : "0");
  } catch {
    // best effort — localStorage/sessionStorage indisponible (navigation privée, etc.)
  }
}

const dynamicAuthStorage: StateStorage = {
  getItem: (name) => {
    try {
      return (isRememberMeEnabled() ? localStorage : sessionStorage).getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      (isRememberMeEnabled() ? localStorage : sessionStorage).setItem(name, value);
    } catch {
      // best effort
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
      sessionStorage.removeItem(name);
    } catch {
      // best effort
    }
  },
};

export interface CidUser {
  id: string;
  email: string;
  role: "membre" | "rh" | "bureau_admin" | "dir_financier" | "super_admin";
  langue_preferee: "fr" | "de" | "ar";
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CidUser | null;
  isAuthenticated: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: CidUser) => void;
  loginSuccess: (access: string, refresh: string, user: CidUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      loginSuccess: (access, refresh, user) =>
        set({ accessToken: access, refreshToken: refresh, user, isAuthenticated: true }),
      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false }),
    }),
    { name: AUTH_STORAGE_KEY, storage: createJSONStorage(() => dynamicAuthStorage) },
  ),
);

// Niveaux de rôle — doit rester synchronisé avec apps.accounts.models.ROLE_LEVELS
export const ROLE_LEVELS: Record<CidUser["role"], number> = {
  membre: 1,
  rh: 2,
  bureau_admin: 3,
  dir_financier: 4,
  super_admin: 5,
};

export function hasRoleAtLeast(user: CidUser | null, minLevel: number): boolean {
  if (!user) return false;
  return ROLE_LEVELS[user.role] >= minLevel;
}
