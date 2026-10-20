import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useZentralHooks from "../../hooks/useZentral";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Hinweis } from "../../types/zentral";
import UebersichtHinweise from "./UebersichtHinweise";

vi.mock("../../hooks/useZentral", async () => {
  const actual = await vi.importActual<typeof useZentralHooks>("../../hooks/useZentral");
  return { ...actual, useHinweise: vi.fn() };
});

function hinweis(overrides: Partial<Hinweis>): Hinweis {
  return {
    id: "evenement:1",
    art: "evenement",
    titel: "Stuttgart – Auswärtsfahrt",
    link: "/evenements?evenement=1",
    gruende: ["plaetze"],
    plaetze_frei: 4,
    plaetze_gesamt: 50,
    tage: null,
    bestand: null,
    ...overrides,
  };
}

function mockHinweise(results: Hinweis[]) {
  vi.mocked(useZentralHooks.useHinweise).mockReturnValue({
    data: { results },
  } as unknown as ReturnType<typeof useZentralHooks.useHinweise>);
}

describe("UebersichtHinweise", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rendert nichts ohne Hinweise", () => {
    mockHinweise([]);
    const { container } = renderWithProviders(<UebersichtHinweise />);
    expect(container).toBeEmptyDOMElement();
  });

  it("verlinkt jeden Hinweis und wählt den Text nach Art und Grund", () => {
    mockHinweise([
      hinweis({ gruende: ["plaetze", "termin"], tage: 2 }),
      hinweis({
        id: "projekt:2",
        art: "projekt",
        titel: "Choreo",
        link: "/projets/2",
        gruende: ["frist"],
        plaetze_frei: null,
        plaetze_gesamt: null,
        tage: 5,
      }),
      hinweis({
        id: "artikel:3",
        art: "artikel",
        titel: "Schal",
        link: "/boutique/3",
        gruende: ["bestand"],
        plaetze_frei: null,
        plaetze_gesamt: null,
        bestand: 3,
      }),
    ]);
    renderWithProviders(<UebersichtHinweise />);

    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/evenements?evenement=1",
      "/projets/2",
      "/boutique/3",
    ]);
    expect(screen.getByText("hinweise.evenement.plaetze_termin")).toBeInTheDocument();
    expect(screen.getByText("hinweise.projekt.projekt_frist")).toBeInTheDocument();
    expect(screen.getByText("hinweise.artikel.artikel_bestand")).toBeInTheDocument();
    expect(screen.getByText("hinweise.aktion_artikel")).toBeInTheDocument();
  });

  it("nutzt den Termin-Text, wenn nur der Termin nah ist", () => {
    mockHinweise([hinweis({ gruende: ["termin"], plaetze_frei: null, tage: 0 })]);
    renderWithProviders(<UebersichtHinweise />);
    expect(screen.getByText("hinweise.evenement.termin")).toBeInTheDocument();
  });

  it("kombiniert bei Artikeln Bestand und Frist", () => {
    mockHinweise([
      hinweis({
        art: "artikel",
        id: "artikel:9",
        link: "/boutique/9",
        gruende: ["bestand", "frist"],
        bestand: 2,
        tage: 1,
      }),
    ]);
    renderWithProviders(<UebersichtHinweise />);
    expect(screen.getByText("hinweise.artikel.artikel_bestand_frist")).toBeInTheDocument();
  });
});
