import { screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import CotisationRedirect from "./CotisationRedirect";

// Marqueur de destination — affiche pathname+search de la route atteinte après le <Navigate/>,
// pour vérifier la cible exacte du redirect sans dépendre du contenu réel de /mon-adhesion.
function Destination() {
  const location = useLocation();
  return <div data-testid="destination">{location.pathname + location.search}</div>;
}

function renderRedirect(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/cotisation" element={<CotisationRedirect />} />
          <Route path="/mon-adhesion" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Phase F (2026-09-26, fusion "Mitgliedsbeitrag" -> "Meine Mitgliedschaft") : /cotisation ne
// rend plus qu'un redirect vers /mon-adhesion, en préservant ?paiement=<id> quand présent (voir
// docstring de tête du composant pour les appelants existants : EvenementsPage, ProjetsPage...).
describe("CotisationRedirect", () => {
  it("redirige vers /mon-adhesion en conservant ?paiement=<id> quand présent", () => {
    renderRedirect("/cotisation?paiement=cot-123");

    expect(screen.getByTestId("destination").textContent).toBe("/mon-adhesion?paiement=cot-123");
  });

  it("redirige vers /mon-adhesion sans query string quand ?paiement= est absent", () => {
    renderRedirect("/cotisation");

    expect(screen.getByTestId("destination").textContent).toBe("/mon-adhesion");
  });
});
