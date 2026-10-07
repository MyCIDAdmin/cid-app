import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { ConfigurationSitePublic } from "../../types/communaute";
import HeroKacheln from "./HeroKacheln";

function konfig(lien: string): ConfigurationSitePublic {
  return {
    kachel1_active: true,
    kachel1_media: "https://cdn.example/a.gif",
    kachel1_titre: "Kachel",
    kachel1_texte: "",
    kachel1_lien: lien,
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
