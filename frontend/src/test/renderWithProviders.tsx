/**
 * Wrapper de test partagé pour les pages/composants qui dépendent de
 * React Query et/ou React Router (DashboardPage.test.tsx n'en avait pas
 * besoin, mais le module membres consomme les deux).
 */
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

// `route` accepte aussi un objet {pathname, state} (pas seulement une chaîne) depuis le
// 2026-09-27 — nécessaire pour tester la redirection post-connexion qui relaie `location.state`
// (voir RequireAuth.tsx/LoginPage.tsx docstrings) : MemoryRouter.initialEntries l'accepte déjà
// nativement, seul le type ici restreignait ce que renderWithProviders pouvait transmettre.
type InitialRoute = string | { pathname: string; state?: unknown };

// Startwerte der Matrix (Migration 0003/0013) für die Seiten, die Komponenten über
// `usePageAccess` prüfen — so bleiben Tests, die nur eine Rolle setzen, aussagekräftig.
const SEITEN_AB_STUFE: Record<string, number> = {
  page_membres: 2,
  page_membres_loeschen: 3,
  page_community: 3,
  page_boutique: 3,
  page_albums: 3,
  page_zahlung_versand: 4,
  page_tippspiel: 5,
  page_hilfe_veroeffentlichen: 2,
  page_hilfe_genehmigen: 3,
};
const ROLLE_STUFE: Record<string, number> = {
  membre: 1,
  rh: 2,
  bureau_admin: 3,
  dir_financier: 4,
  super_admin: 5,
};

export function standardMesAccesFuerRolle(rolle: string | undefined): Record<string, string> {
  const stufe = ROLLE_STUFE[rolle ?? ""] ?? 0;
  const zugriff: Record<string, string> = {};
  for (const [seite, ab] of Object.entries(SEITEN_AB_STUFE)) {
    zugriff[seite] = stufe >= ab ? "lecture_ecriture" : "aucun";
  }
  // Abstimmungen: nur Büro und App Admin (nicht RH, nicht Finanzen).
  for (const modul of [
    "membres",
    "cotisations",
    "adhesions",
    "evenements",
    "boutique",
    "vote",
    "communaute",
    "projets",
  ]) {
    zugriff[modul] = "lecture_ecriture";
  }
  zugriff.page_abstimmungen =
    rolle === "bureau_admin" || rolle === "super_admin" ? "lecture_ecriture" : "aucun";
  return zugriff;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = "/",
    path = "/",
    mesAcces,
  }: { route?: InitialRoute; path?: string; mesAcces?: Record<string, string> } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    ["rbac", "mes-acces"],
    mesAcces ?? standardMesAccesFuerRolle(useAuthStore.getState().user?.role),
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<div data-testid="route-fallback" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
