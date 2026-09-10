/**
 * Store d'authentification Zustand (TDD §1, PPS Sprint 3-4).
 * Persistance en localStorage — accès/refresh JWT, profil utilisateur.
 * ATTENTION : localStorage est vulnérable XSS, compensé par CSP stricte
 * côté backend (SCD §3.4) — ne jamais y stocker de donnée sensible en plus.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

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
    { name: "cid-auth" },
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
