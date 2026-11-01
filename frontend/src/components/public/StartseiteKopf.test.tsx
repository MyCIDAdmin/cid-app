import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { renderWithProviders } from "../../test/renderWithProviders";
import StartseiteKopf from "./StartseiteKopf";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useConfigurationSitePublic: vi.fn() };
});

function konfig(felder: Record<string, unknown>) {
  vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
    data: {
      video_hero: null,
      kachel1_active: false,
      kachel1_media: null,
      kachel1_titre: "",
      kachel1_texte: "",
      kachel1_lien: "",
      kachel1_lien_text: "",
      kachel1_largeur: "demi",
      kachel2_active: false,
      kachel2_media: null,
      kachel2_titre: "",
      kachel2_texte: "",
      kachel2_lien: "",
      kachel2_lien_text: "",
      kachel2_largeur: "demi",
      ...felder,
    },
  } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
}

describe("StartseiteKopf", () => {
  it("zeigt Hero und die Kacheln unter dem Hero-Video, wenn sie eingestellt sind", () => {
    konfig({
      kachel1_active: true,
      kachel1_media: "https://cdn.example/kachel1.gif",
      kachel1_titre: "Erste Kachel",
      kachel2_active: true,
      kachel2_media: "https://cdn.example/kachel2.png",
      kachel2_titre: "Zweite Kachel",
    });
    renderWithProviders(<StartseiteKopf />);

    expect(screen.getByText("hero.titre")).toBeInTheDocument();
    expect(screen.getByAltText("Erste Kachel")).toHaveAttribute(
      "src",
      "https://cdn.example/kachel1.gif",
    );
    expect(screen.getByAltText("Zweite Kachel")).toBeInTheDocument();
  });

  it("zeigt nur aktive Kacheln mit Bild", () => {
    konfig({
      kachel1_active: true,
      kachel1_media: null,
      kachel1_titre: "Ohne Bild",
      kachel2_active: false,
      kachel2_media: "https://cdn.example/kachel2.png",
      kachel2_titre: "Inaktiv",
    });
    renderWithProviders(<StartseiteKopf />);

    expect(screen.queryByAltText("Ohne Bild")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Inaktiv")).not.toBeInTheDocument();
  });
});
