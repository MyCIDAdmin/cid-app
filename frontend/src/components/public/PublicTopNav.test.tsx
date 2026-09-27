import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import PublicTopNav from "./PublicTopNav";

describe("PublicTopNav", () => {
  it("met en évidence l'onglet actif", () => {
    renderWithProviders(<PublicTopNav onglet="projets" onChangeOnglet={vi.fn()} />);
    expect(screen.getByRole("button", { name: "nav.projets" })).toHaveClass("bg-cal");
    expect(screen.getByRole("button", { name: "nav.accueil" })).not.toHaveClass("bg-cal");
  });

  it("appelle onChangeOnglet au clic sur un onglet", () => {
    const onChangeOnglet = vi.fn();
    renderWithProviders(<PublicTopNav onglet="accueil" onChangeOnglet={onChangeOnglet} />);
    fireEvent.click(screen.getByRole("button", { name: "nav.shop" }));
    expect(onChangeOnglet).toHaveBeenCalledWith("shop");
  });

  it("le bouton \"Anmelden / Registrieren\" pointe vers /login", () => {
    renderWithProviders(<PublicTopNav onglet="accueil" onChangeOnglet={vi.fn()} />);
    const liens = screen.getAllByText("action.connexion");
    expect(liens[0].closest("a")).toHaveAttribute("href", "/login");
  });

  it("le menu mobile est fermé par défaut puis s'ouvre au clic", () => {
    renderWithProviders(<PublicTopNav onglet="accueil" onChangeOnglet={vi.fn()} />);
    const bouton = screen.getByRole("button", { name: "nav.aria_label" });
    expect(bouton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bouton);
    expect(bouton).toHaveAttribute("aria-expanded", "true");
  });
});
