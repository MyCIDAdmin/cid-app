import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as rbac from "../../hooks/useRbac";
import * as regionen from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { RanglisteZeile } from "../../types/regionen";
import { sortiereRegionen } from "../../utils/startseite";
import RegionenArena from "./RegionenArena";

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof rbac>("../../hooks/useRbac");
  return { ...actual, useModuleOuvert: vi.fn() };
});
vi.mock("../../hooks/useRegionen", async () => {
  const actual = await vi.importActual<typeof regionen>("../../hooks/useRegionen");
  return { ...actual, useWettbewerb: vi.fn() };
});

function zeile(name: string, punkte: number, mitglieder: number, treffen = 3): RanglisteZeile {
  return {
    rang: 1,
    region: { slug: name.toLowerCase(), name, farbe: "#d8141f" },
    punkte,
    mitglieder,
    punkte_pro_mitglied: punkte / mitglieder,
    treffen,
    abzeichen: [],
  };
}

const ZEILEN = [
  zeile("Nord", 170, 38),
  zeile("NRW", 590, 80),
  zeile("Berlin", 430, 61),
  zeile("München", 400, 46),
];

function daten(extra: Record<string, unknown> = {}) {
  vi.mocked(regionen.useWettbewerb).mockReturnValue({
    data: {
      saison: { name: "2026/27", preis: "" },
      rangliste: ZEILEN,
      monatssieger: [{ monat: "2026-10", regionen: ["NRW"] }],
      ...extra,
    },
  } as unknown as ReturnType<typeof regionen.useWettbewerb>);
}

function namen() {
  return screen
    .getAllByRole("listitem")
    .map((li) => li.textContent?.match(/Nord|NRW|Berlin|München/)?.[0]);
}

describe("RegionenArena", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: true, chargement: false });
  });

  it("sortiert nach Punkten je Mitglied und lässt sich auf Gesamtpunkte umschalten", () => {
    daten();
    renderWithProviders(<RegionenArena />);
    expect(namen()).toEqual(["München", "NRW", "Berlin", "Nord"]);

    fireEvent.click(screen.getByRole("button", { name: "startseite.arena.gesamt" }));
    expect(namen()).toEqual(["NRW", "Berlin", "München", "Nord"]);
  });

  it("nennt die fleißigste Region des letzten Monats und verlinkt die Rangliste", () => {
    daten();
    renderWithProviders(<RegionenArena />);
    expect(screen.getByText("startseite.arena.fleissigste").parentElement).toHaveTextContent("NRW");
    expect(screen.getByRole("link", { name: /startseite.arena.zur_rangliste/ })).toHaveAttribute(
      "href",
      "/regionen/wettbewerb",
    );
  });

  it("zeigt nichts ohne Saison oder ohne Regionen", () => {
    daten({ saison: null });
    const { container } = renderWithProviders(<RegionenArena />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt nichts, wenn das Modul Sektoren geschlossen ist", () => {
    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: false, chargement: false });
    daten();
    const { container } = renderWithProviders(<RegionenArena />);
    expect(container).toBeEmptyDOMElement();
    expect(regionen.useWettbewerb).not.toHaveBeenCalled();
  });

  it("sortiert bei Gleichstand nach Gesamtpunkten", () => {
    const sortiert = sortiereRegionen([zeile("A", 10, 2), zeile("B", 20, 4)], "pro_mitglied");
    expect(sortiert.map((z) => z.region.name)).toEqual(["B", "A"]);
  });
});
