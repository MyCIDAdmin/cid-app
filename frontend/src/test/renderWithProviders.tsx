/**
 * Wrapper de test partagé pour les pages/composants qui dépendent de
 * React Query et/ou React Router (DashboardPage.test.tsx n'en avait pas
 * besoin, mais le module membres consomme les deux).
 */
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// `route` accepte aussi un objet {pathname, state} (pas seulement une chaîne) depuis le
// 2026-09-27 — nécessaire pour tester la redirection post-connexion qui relaie `location.state`
// (voir RequireAuth.tsx/LoginPage.tsx docstrings) : MemoryRouter.initialEntries l'accepte déjà
// nativement, seul le type ici restreignait ce que renderWithProviders pouvait transmettre.
type InitialRoute = string | { pathname: string; state?: unknown };

export function renderWithProviders(
  ui: ReactElement,
  { route = "/", path = "/" }: { route?: InitialRoute; path?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

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
