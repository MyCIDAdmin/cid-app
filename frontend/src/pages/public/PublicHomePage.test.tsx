import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import PublicHomePage from "./PublicHomePage";

describe("PublicHomePage", () => {
  it("affiche l'onglet 'accueil' par défaut avec le CTA d'adhésion", () => {
    renderWithProviders(<PublicHomePage />);
    expect(screen.getByText("hero.titre")).toBeInTheDocument();
    expect(screen.getByText("hero.cta_mitglied_werden").closest("a")).toHaveAttribute(
      "href",
      "/mon-adhesion",
    );
  });

  it("affiche toujours la nav et le footer, quel que soit l'onglet", () => {
    renderWithProviders(<PublicHomePage />);
    expect(screen.getByText("action.connexion")).toBeInTheDocument();
    expect(screen.getByText("footer.rechtliches_titre")).toBeInTheDocument();
  });

  it("bascule vers un onglet pas encore construit sans faire disparaître nav/footer", () => {
    renderWithProviders(<PublicHomePage />);
    fireEvent.click(screen.getByRole("button", { name: "nav.evenements" }));

    expect(screen.getByText("onglet_a_venir.description")).toBeInTheDocument();
    expect(screen.queryByText("hero.titre")).not.toBeInTheDocument();
    expect(screen.getByText("action.connexion")).toBeInTheDocument();
    expect(screen.getByText("footer.rechtliches_titre")).toBeInTheDocument();
  });

  it("revient à l'accueil au clic sur le logo", () => {
    renderWithProviders(<PublicHomePage />, { route: "/?onglet=projets" });
    expect(screen.getByText("onglet_a_venir.description")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Clubistes in Deutschland"));
    expect(screen.getByText("hero.titre")).toBeInTheDocument();
  });
});
