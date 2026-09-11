import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { queryClient } from "../../queryClient";
import { useAuthStore } from "../../store/authStore";
import Sidebar from "./Sidebar";

const utilisateur = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

describe("Sidebar — déconnexion (AHM-51)", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: utilisateur,
      isAuthenticated: true,
    });
  });

  it("affiche un bouton de déconnexion pour un utilisateur connecté", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("action.deconnexion")).toBeInTheDocument();
  });

  it("vide l'état d'authentification et le cache React Query au clic", () => {
    // Simule des données d'un compte précédent encore en cache (cf bug
    // corrigé : ces données ne doivent pas fuiter vers le prochain compte
    // connecté dans le même onglet).
    queryClient.setQueryData(["membres", "list"], { results: [{ id: "m1" }] });

    renderWithProviders(<Sidebar />, { route: "/dashboard", path: "/dashboard" });
    fireEvent.click(screen.getByText("action.deconnexion"));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(queryClient.getQueryData(["membres", "list"])).toBeUndefined();
  });
});
