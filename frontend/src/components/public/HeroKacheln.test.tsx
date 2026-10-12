import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { ConfigurationSitePublic } from "../../types/communaute";
import HeroKacheln from "./HeroKacheln";

function konfig(lien: string, lienText = ""): ConfigurationSitePublic {
  return {
    kachel1_active: true,
    kachel1_media: "https://cdn.example/a.gif",
    kachel1_titre: "Kachel",
    kachel1_texte: "",
    kachel1_lien: lien,
    kachel1_lien_text: lienText,
    kachel1_largeur: "halb",
    kachel2_active: false,
  } as unknown as ConfigurationSitePublic;
}

describe("HeroKacheln — Link-Sicherheit", () => {
  it("verlinkt http(s)-Ziele und interne Pfade", () => {
    const { unmount } = renderWithProviders(<HeroKacheln config={konfig("https://a.example/x")} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://a.example/x");
    unmount();
    renderWithProviders(<HeroKacheln config={konfig("/boutique")} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/boutique");
  });

  it.each(["javascript:alert(1)", "//evil.example", "data:text/html,x"])(
    "rendert %s nicht als Link",
    (lien) => {
      renderWithProviders(<HeroKacheln config={konfig(lien)} />);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("Kachel")).toBeInTheDocument();
    },
  );
});

describe("HeroKacheln — erkennbarer Link-Text", () => {
  it("zeigt die Beschriftung mit Link-Symbol innerhalb des Links", () => {
    renderWithProviders(<HeroKacheln config={konfig("/boutique", "Zum Shop")} />);
    const link = screen.getByRole("link", { name: /Zum Shop/ });
    const text = screen.getByTestId("kachel-link-text");
    expect(link).toContainElement(text);
    expect(text).toHaveTextContent("Zum Shop");
    expect(text.querySelector("svg")).not.toBeNull();
  });

  it("nutzt ohne Beschriftung den Standardtext, damit der Link erkennbar bleibt", () => {
    renderWithProviders(<HeroKacheln config={konfig("https://a.example/x")} />);
    expect(screen.getByTestId("kachel-link-text")).toHaveTextContent("kacheln_lien_standard");
  });

  it("zeigt ohne gültigen Link keine Link-Beschriftung", () => {
    renderWithProviders(<HeroKacheln config={konfig("javascript:alert(1)", "Zum Shop")} />);
    expect(screen.queryByTestId("kachel-link-text")).toBeNull();
  });
});
