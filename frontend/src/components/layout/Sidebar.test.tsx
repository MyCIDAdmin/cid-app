import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { queryClient } from "../../queryClient";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";
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
    useUiStore.setState({ sidebarCollapsed: false });
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

  it("se replie et se déplie au clic sur le bouton dédié (persisté via uiStore)", () => {
    const { container } = renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("action.replier_sidebar"));

    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.queryByText("nav.dashboard")).not.toBeInTheDocument();
    // Repliée, les items restent identifiables : icône toujours affichée (cf
    // NAV_ITEMS.icon) + libellé exposé en `title` natif à la place du texte.
    expect(container.querySelectorAll("nav svg").length).toBeGreaterThan(0);
    expect(screen.getByTitle("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("action.deplier_sidebar"));

    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();
  });
});
