import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import PublicFooter from "./PublicFooter";

describe("PublicFooter", () => {
  it("affiche les liens légaux vers mycid.org", () => {
    renderWithProviders(<PublicFooter />);
    expect(screen.getByText("footer.impressum").closest("a")).toHaveAttribute(
      "href",
      "https://www.mycid.org/impressum",
    );
    expect(screen.getByText("footer.datenschutz").closest("a")).toHaveAttribute(
      "href",
      "https://www.mycid.org/privacy",
    );
    expect(screen.getByText("footer.agb").closest("a")).toHaveAttribute(
      "href",
      "https://www.mycid.org/terms",
    );
    expect(screen.getByText("footer.erstattung").closest("a")).toHaveAttribute(
      "href",
      "https://www.mycid.org/refund-policy",
    );
  });

  it("affiche le contact et les réseaux sociaux", () => {
    renderWithProviders(<PublicFooter />);
    expect(screen.getByText("info@clubistesindeutschland.org")).toHaveAttribute(
      "href",
      "mailto:info@clubistesindeutschland.org",
    );
    expect(screen.getByText("footer.facebook").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("facebook.com"),
    );
    expect(screen.getByText("footer.instagram").closest("a")).toHaveAttribute(
      "href",
      "https://www.instagram.com/clubistes_in_deutschland/",
    );
  });

  // Retour utilisateur du 2026-09-27 ("die Logos für CID, Mail, location, instagram und facebook
  // hinzufügen") : blason CID dans le bloc de marque, et "footer.pays" devient un lien externe
  // vers l'emplacement Google Maps fourni par l'utilisateur (voir LIEN_LOCALISATION).
  it("affiche le blason CID et un lien vers la localisation", () => {
    renderWithProviders(<PublicFooter />);
    expect(screen.getByAltText("Clubistes in Deutschland")).toBeInTheDocument();
    expect(screen.getByText("footer.pays").closest("a")).toHaveAttribute(
      "href",
      "https://share.google/2bOef3rWXOlAMprNM",
    );
  });
});
