/**
 * Wrapper de test partagé pour les pages/composants qui dépendent de
 * React Query et/ou React Router (DashboardPage.test.tsx n'en avait pas
 * besoin, mais le module membres consomme les deux).
 */
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

export function renderWithProviders(
  ui: ReactElement,
  { route = "/", path = "/" }: { route?: string; path?: string } = {},
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
