import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { TippspielMatrix } from "../../types/communaute";
import TippspielInZahlen from "./TippspielInZahlen";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useMeinTippstand: vi.fn(), useTippspielMatrix: vi.fn() };
});

const matrix: TippspielMatrix = {
  tippspiel: "tp1",
  tipps_sichtbar: true,
  teilnehmer: 12,
  letztes_spiel: "r1",
  spalten: [],
  zeilen: [
    {
      rang: 3,
      rang_vorher: 4,
      name: "Sana W.",
      ist_ich: true,
      punkte: 11,
      exakt: 2,
      letzte_punkte: 4,
      tipps: {
        a: { d: 1, e: 0, p: 4 },
        b: { d: 0, e: 0, p: 0 },
        c: { d: 2, e: 1, p: 2 },
        d: { d: 1, e: 1, p: null },
      },
    },
  ],
};

function bereit(bestaetigt: boolean, daten: TippspielMatrix | undefined = matrix) {
  vi.mocked(useCommunauteHooks.useMeinTippstand).mockReturnValue({
    tippspiel: { id: "tp1" } as never,
    teilnahme: undefined,
    bestaetigt,
    tippsProSpiel: new Map(),
  });
  vi.mocked(useCommunauteHooks.useTippspielMatrix).mockReturnValue({
    data: daten,
  } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielMatrix>);
}

describe("TippspielInZahlen", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: { id: "u1", email: "a@b.de", role: "membre", langue_preferee: "de" } as never,
      isAuthenticated: true,
    });
  });

  it("zeigt Platz, Punkte, exakte Treffer und die Trefferquote", () => {
    bereit(true);
    renderWithProviders(<TippspielInZahlen />);
    const karte = screen.getByTestId("tippspiel-in-zahlen");
    expect(karte).toHaveTextContent("3 / 12");
    expect(karte).toHaveTextContent("11");
    expect(karte).toHaveTextContent("2");
    // 2 von 3 gewerteten Tipps haben Punkte (offene Spiele zählen nicht)
    expect(karte).toHaveTextContent("67 %");
  });

  it("bleibt ohne bestätigte Teilnahme weg", () => {
    bereit(false);
    renderWithProviders(<TippspielInZahlen />);
    expect(screen.queryByTestId("tippspiel-in-zahlen")).not.toBeInTheDocument();
  });

  it("bleibt weg, wenn der Betrachter nicht in der Rangliste steht", () => {
    bereit(true, { ...matrix, zeilen: [] });
    renderWithProviders(<TippspielInZahlen />);
    expect(screen.queryByTestId("tippspiel-in-zahlen")).not.toBeInTheDocument();
  });
});
