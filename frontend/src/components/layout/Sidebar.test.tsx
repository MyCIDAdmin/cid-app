import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { queryClient } from "../../queryClient";
import { useAuthStore } from "../../store/authStore";
import { DEFAULT_COLLAPSED_GROUPS, useUiStore } from "../../store/uiStore";
import Sidebar from "./Sidebar";

const utilisateur = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

// Rôle le plus élevé (cf ROLE_LEVELS dans authStore) : seul lui voit le groupe "Administration"
// dans les tests ci-dessous qui en ont besoin.
const administrateur = {
  ...utilisateur,
  id: "u2",
  email: "admin@example.com",
  role: "super_admin" as const,
};

describe("Sidebar — déconnexion (AHM-51)", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: utilisateur,
      isAuthenticated: true,
    });
    useUiStore.setState({ sidebarCollapsed: false, collapsedGroups: DEFAULT_COLLAPSED_GROUPS });
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

  it("regroupe les modules par catégorie, le groupe Administration replié par défaut", () => {
    useAuthStore.setState({ user: administrateur });
    renderWithProviders(<Sidebar />);

    // Groupe "Général" (toujours ouvert par défaut) : ses items sont visibles directement.
    expect(screen.getByText("nav_groupe.general")).toBeInTheDocument();
    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    // Groupe "Administration" (replié par défaut, cf uiStore.DEFAULT_COLLAPSED_GROUPS) : l'en-tête
    // est là mais pas ses items — sans ça, super_admin verrait toujours ses 9 modules admin.
    expect(screen.getByText("nav_groupe.administration")).toBeInTheDocument();
    expect(screen.queryByText("nav.admin_events")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("nav_groupe.administration"));

    expect(useUiStore.getState().collapsedGroups.administration).toBe(false);
    expect(screen.getByText("nav.admin_events")).toBeInTheDocument();
  });

  it("permet de replier le groupe Général même quand sa page (tableau de bord) est active", () => {
    // Bug corrigé : une première version forçait l'ouverture du groupe contenant la page
    // active, ce qui rendait "Général" impossible à replier en pratique (il contient le
    // tableau de bord, donc quasiment toujours actif) — le clic sur l'en-tête doit primer.
    renderWithProviders(<Sidebar />, { route: "/dashboard", path: "/dashboard" });

    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByText("nav_groupe.general"));

    expect(useUiStore.getState().collapsedGroups.general).toBe(true);
    expect(screen.queryByText("nav.dashboard")).not.toBeInTheDocument();
    // L'en-tête reste néanmoins mis en évidence pour indiquer que la page active s'y trouve.
    expect(screen.getByText("nav_groupe.general").closest("button")).toHaveClass("text-white/70");
  });
});
