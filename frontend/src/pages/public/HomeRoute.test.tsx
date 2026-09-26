import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { useAuthStore } from "../../store/authStore";
import HomeRoute from "./HomeRoute";

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

  it("redirige vers /dashboard pour un membre actif connecté", () => {
    setAuth({
      isAuthenticated: true,
      user: {
        id: "u1",
        email: "membre@example.com",
        role: "membre",
        langue_preferee: "fr",
        statut_membre: "actif",
      },
    });
    renderWithProviders(<HomeRoute />);
    expect(screen.getByTestId("route-fallback")).toBeInTheDocument();
  });

  it("affiche PublicHomePage pour un membre connecté dont le statut n'est pas actif", () => {
    setAuth({
      isAuthenticated: true,
      user: {
        id: "u1",
        email: "membre@example.com",
        role: "membre",
        langue_preferee: "fr",
        statut_membre: "en_attente",
      },
    });
    renderWithProviders(<HomeRoute />);
    expect(screen.getByText("action.connexion")).toBeInTheDocument();
  });

  it("redirige vers /dashboard pour un compte de gestion sans fiche Membre liée (statut_membre null)", () => {
    setAuth({
      isAuthenticated: true,
      user: {
        id: "u2",
        email: "admin@example.com",
        role: "bureau_admin",
        langue_preferee: "fr",
        statut_membre: null,
      },
    });
    renderWithProviders(<HomeRoute />);
    expect(screen.getByTestId("route-fallback")).toBeInTheDocument();
  });

  it("redirige vers /dashboard pour un compte connecté sans statut_membre chargé (session persistée avant ce champ)", () => {
    setAuth({
      isAuthenticated: true,
      user: { id: "u3", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    renderWithProviders(<HomeRoute />);
    expect(screen.getByTestId("route-fallback")).toBeInTheDocument();
  });
});
