import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { useAuthStore } from "../../store/authStore";
import HomeRoute from "./HomeRoute";

// AppLayout (Sidebar, cloche...) déclenche ses propres requêtes — hors sujet ici : seul compte
// le choix "page publique" vs "layout applicatif".
vi.mock("../../components/layout/AppLayout", () => ({
  default: () => <div data-testid="app-layout" />,
}));

function setAuth(overrides: Partial<Parameters<typeof useAuthStore.setState>[0]> = {}) {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
    ...overrides,
  });
}

describe("HomeRoute", () => {
  it("affiche PublicHomePage pour un visiteur non connecté", () => {
    setAuth();
    renderWithProviders(<HomeRoute />);
    expect(screen.getByText("action.connexion")).toBeInTheDocument();
    expect(screen.queryByTestId("route-fallback")).not.toBeInTheDocument();
  });

  // Point 1.2 (2026-10-05) : un utilisateur connecté reste sur "/" — AppLayout (Sidebar), sans
  // la barre horizontale publique (PublicTopNav), qu'il soit membre actif ou non.
  it.each(["actif", "en_attente", null] as const)(
    "affiche l'AppLayout sans barre publique pour un connecté (statut_membre=%s)",
    (statut) => {
      setAuth({
        isAuthenticated: true,
        accessToken: "token",
        user: {
          id: "u1",
          email: "membre@example.com",
          role: "membre",
          langue_preferee: "fr",
          statut_membre: statut,
        },
      });
      renderWithProviders(<HomeRoute />);
      expect(screen.queryByText("action.connexion")).not.toBeInTheDocument();
      expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    },
  );
});
