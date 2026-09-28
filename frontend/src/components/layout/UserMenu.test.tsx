/**
 * Tests du menu utilisateur (topbar, ajouté le 2026-09-28 — voir docstring de UserMenu.tsx).
 * La déconnexion, déplacée ici depuis Sidebar/MobileNavDrawer, reprend le test de non-régression
 * "vide le cache React Query" qui vivait auparavant dans Sidebar.test.tsx (AHM-51).
 */
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../../queryClient";
import { renderWithProviders } from "../../test/renderWithProviders";
import { useAuthStore } from "../../store/authStore";
import UserMenu from "./UserMenu";

const utilisateurAvecFiche = {
  id: "u1",
  email: "riadh.bchini@example.de",
  role: "membre" as const,
  langue_preferee: "fr" as const,
  prenom: "Riadh",
  nom: "Bchini",
};

const utilisateurSansFiche = {
  id: "u2",
  email: "admin@example.de",
  role: "super_admin" as const,
  langue_preferee: "fr" as const,
};

describe("UserMenu", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: utilisateurAvecFiche,
      isAuthenticated: true,
    });
  });

  it("ne rend rien sans utilisateur connecté", () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const { container } = renderWithProviders(<UserMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche les initiales prénom/nom sur le bouton déclencheur", () => {
    renderWithProviders(<UserMenu />);
    expect(screen.getByLabelText("menu_utilisateur.aria_label")).toHaveTextContent("RB");
  });

  it("retombe sur l'initiale de l'e-mail si aucune fiche Membre n'est liée au compte", () => {
    useAuthStore.setState({ user: utilisateurSansFiche });
    renderWithProviders(<UserMenu />);
    expect(screen.getByLabelText("menu_utilisateur.aria_label")).toHaveTextContent("A");
  });

  it("ouvre le menu au clic et affiche l'identité, le lien profil et les préférences", () => {
    renderWithProviders(<UserMenu />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("menu_utilisateur.aria_label"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Riadh Bchini")).toBeInTheDocument();
    expect(screen.getByText("riadh.bchini@example.de")).toBeInTheDocument();
    const lienProfil = screen.getByText("menu_utilisateur.mon_profil").closest("a");
    expect(lienProfil).toHaveAttribute("href", "/mon-profil");
    expect(screen.getByText("menu_utilisateur.preferences_titre")).toBeInTheDocument();
    expect(screen.getByText("action.deconnexion")).toBeInTheDocument();
  });

  it("referme le menu au clic extérieur", () => {
    renderWithProviders(<UserMenu />);
    fireEvent.click(screen.getByLabelText("menu_utilisateur.aria_label"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("referme le menu au clic sur le lien profil", () => {
    renderWithProviders(<UserMenu />);
    fireEvent.click(screen.getByLabelText("menu_utilisateur.aria_label"));

    fireEvent.click(screen.getByText("menu_utilisateur.mon_profil"));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // Reprend le test de non-régression AHM-51 qui vivait dans Sidebar.test.tsx avant que la
  // déconnexion ne déménage ici (retour utilisateur du 2026-09-28, point 2.3).
  it("vide l'état d'authentification et le cache React Query au clic sur Abmelden", () => {
    queryClient.setQueryData(["membres", "list"], { results: [{ id: "m1" }] });

    renderWithProviders(<UserMenu />);
    fireEvent.click(screen.getByLabelText("menu_utilisateur.aria_label"));
    fireEvent.click(screen.getByText("action.deconnexion"));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(queryClient.getQueryData(["membres", "list"])).toBeUndefined();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
