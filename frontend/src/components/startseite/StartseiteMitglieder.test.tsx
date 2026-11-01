import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import StartseiteMitglieder from "./StartseiteMitglieder";

// Jeder Baustein hat eigene Tests ; hier zählt nur die Reihenfolge laut „Startseite_Einordnung“.
const { stub } = vi.hoisted(() => ({
  stub: (id: string) => ({
    default: () => <div data-testid={id} />,
  }),
}));
vi.mock("../public/StartseiteKopf", () => stub("kopf"));
vi.mock("../public/NextMatchTile", () => stub("naechstes-spiel"));
vi.mock("../public/FanClubPreview", () => stub("live"));
vi.mock("../public/KennzahlenBar", () => stub("kennzahlen"));
vi.mock("../public/SponsorenBanner", () => stub("sponsoren"));
vi.mock("./RegionenArena", () => stub("arena"));
vi.mock("./WirSindClubistes", () => stub("clubistes"));
vi.mock("./FotoalbenKarte", () => stub("alben"));
vi.mock("./ProjekteImFokus", () => stub("projekte"));
vi.mock("./ShopNeuheiten", () => stub("shop"));
vi.mock("../public/PublicEvenementsTab", () => stub("veranstaltungen"));

describe("StartseiteMitglieder", () => {
  it("zeigt die Bausteine in der gewünschten Reihenfolge", () => {
    renderWithProviders(<StartseiteMitglieder />);
    const ids = Array.from(document.querySelectorAll("[data-testid]")).map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids).toEqual([
      "kopf",
      "naechstes-spiel",
      "live",
      "arena",
      "clubistes",
      "alben",
      "kennzahlen",
      "projekte",
      "shop",
      "sponsoren",
    ]);
  });

  it("enthält keine Veranstaltungen mehr", () => {
    renderWithProviders(<StartseiteMitglieder />);
    expect(document.querySelector('[data-testid="veranstaltungen"]')).toBeNull();
  });

  it("stellt Zahlen und Fotoalben sowie Projekte und Shop nebeneinander", () => {
    renderWithProviders(<StartseiteMitglieder />);
    const zeile1 = document.querySelector('[data-testid="clubistes"]')?.parentElement;
    const zeile2 = document.querySelector('[data-testid="projekte"]')?.parentElement;
    expect(zeile1?.contains(document.querySelector('[data-testid="alben"]'))).toBe(true);
    expect(zeile2?.contains(document.querySelector('[data-testid="shop"]'))).toBe(true);
  });
});
