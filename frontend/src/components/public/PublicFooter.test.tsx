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
});
