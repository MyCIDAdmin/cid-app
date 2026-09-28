import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { useAuthStore } from "../store/authStore";
import RequireAuth from "./RequireAuth";

// Stub minimal de /login qui n'affiche que ce que RequireAuth.tsx lui transmet via
// `state.from` — vérifie le comportement documenté dans RequireAuth.tsx/LoginPage.tsx (retour
// utilisateur du 2026-09-27 : revenir à la page initialement visée après connexion, pas
// systématiquement /dashboard). Rendu directement avec MemoryRouter/Routes ici plutôt que via
// renderWithProviders (qui n'expose qu'une seule route + un fallback générique) car ce test a
// justement besoin de deux routes réelles pour observer la redirection et son state.
function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return <div data-testid="login-stub">from:{from ?? "none"}</div>;
}

function setAuth(isAuthenticated: boolean) {
  useAuthStore.setState({
    isAuthenticated,
    user: isAuthenticated
      ? { id: "u1", email: "membre@example.com", role: "membre", langue_preferee: "fr" }
      : null,
  });
}

function renderProtege(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route
          path="/mon-adhesion"
          element={
            <RequireAuth>
              <div>contenu protégé</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  it("redirige vers /login en mémorisant la page visée (state.from) pour y revenir après connexion", () => {
    setAuth(false);
    renderProtege("/mon-adhesion");

    expect(screen.queryByText("contenu protégé")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-stub")).toHaveTextContent("from:/mon-adhesion");
  });

  it("rend les enfants sans redirection quand l'utilisateur est authentifié", () => {
    setAuth(true);
    renderProtege("/mon-adhesion");

    expect(screen.getByText("contenu protégé")).toBeInTheDocument();
    expect(screen.queryByTestId("login-stub")).not.toBeInTheDocument();
  });
});
