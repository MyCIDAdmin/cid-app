import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useStats";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { KpisProjets } from "../../types/stats";
import OngletProjets from "./OngletProjets";

vi.mock("../../hooks/useStats", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useStats");
  return { ...actual, useStatsProjets: vi.fn() };
});

const DATEN: KpisProjets = {
  projekte_gesamt: 2,
  veroeffentlicht: 1,
  entwurf: 1,
  nach_status: [{ statut: "en_cours", nombre: 2 }],
  aufgaben: { gesamt: 4, erledigt: 1, ueberfaellig: 2, quote: 25, pro_status: {} },
  kosten: {
    plan: "300.00",
    ist: "75.00",
    offen: "10.00",
    einnahmen: "120.00",
    ergebnis: "45.00",
    auslastung: 25,
  },
  projekte: [
    {
      id: "p1",
      titre: "Alpha",
      statut: "en_cours",
      sichtbarkeit: "veroeffentlicht",
      team: 3,
      aufgaben_gesamt: 4,
      aufgaben_erledigt: 1,
      prozent: 25,
      ueberfaellig: 2,
      plan: "300.00",
      ist: "75.00",
      offen: "10.00",
      einnahmen: "120.00",
      ergebnis: "45.00",
    },
    {
      id: "p2",
      titre: "Beta",
      statut: "en_cours",
      sichtbarkeit: "entwurf",
      team: 0,
      aufgaben_gesamt: 0,
      aufgaben_erledigt: 0,
      prozent: 0,
      ueberfaellig: 0,
      plan: "0.00",
      ist: "0.00",
      offen: "0.00",
      einnahmen: "0.00",
      ergebnis: "0.00",
    },
  ],
};

describe("OngletProjets", () => {
  beforeEach(() => vi.mocked(hooks.useStatsProjets).mockReset());

  it("zeigt Kacheln und die Tabelle je Projekt", () => {
    vi.mocked(hooks.useStatsProjets).mockReturnValue({
      data: DATEN,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useStatsProjets>);
    renderWithProviders(<OngletProjets />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("1/4 (25 %)")).toBeInTheDocument();
    expect(screen.getAllByText("300,00 €").length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("sortiert nach Ergebnis absteigend per Klick auf die Spalte", () => {
    vi.mocked(hooks.useStatsProjets).mockReturnValue({
      data: DATEN,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useStatsProjets>);
    renderWithProviders(<OngletProjets />);
    fireEvent.click(screen.getByText("projekte.col_ergebnis"));
    fireEvent.click(screen.getByText("projekte.col_ergebnis"));
    const zeilen = screen.getAllByRole("row");
    expect(zeilen[1]).toHaveTextContent("Alpha");
  });

  it("zeigt Lade- und Fehlerzustand", () => {
    vi.mocked(hooks.useStatsProjets).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof hooks.useStatsProjets>);
    renderWithProviders(<OngletProjets />);
    expect(screen.getByText("erreur")).toBeInTheDocument();
  });
});
