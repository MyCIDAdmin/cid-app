import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useStatsHooks from "../../hooks/useStats";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { PivotErgebnis } from "../../types/stats";
import OngletPivot from "./OngletPivot";

vi.mock("../../hooks/useStats", async () => {
  const actual = await vi.importActual<typeof useStatsHooks>("../../hooks/useStats");
  return { ...actual, useStatsPivot: vi.fn() };
});

const ergebnis: PivotErgebnis = {
  zeilen_dim: "kategorie",
  spalten_dim: "jahr",
  kennzahl: "betrag",
  jahr_von: 2025,
  jahr_bis: 2026,
  spalten: ["2025", "2026"],
  zeilen: [{ label: "Beiträge", werte: [100, 45], summe: 145 }],
  spalten_summen: [100, 45],
  gesamt: 145,
  anzahl_buchungen: 3,
};

describe("OngletPivot", () => {
  beforeEach(() => {
    vi.mocked(useStatsHooks.useStatsPivot).mockReturnValue({
      data: ergebnis,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useStatsHooks.useStatsPivot>);
  });

  it("zeigt Zeilen, Spalten und Summen", () => {
    renderWithProviders(<OngletPivot />);
    expect(screen.getByText("Beiträge")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getAllByText("145,00 €").length).toBeGreaterThanOrEqual(2);
  });

  it("fragt mit geänderter Dimension neu ab und tauscht Zeilen und Spalten", () => {
    renderWithProviders(<OngletPivot />);
    fireEvent.change(screen.getByLabelText("pivot.zeilen"), { target: { value: "typ" } });
    expect(useStatsHooks.useStatsPivot).toHaveBeenLastCalledWith(
      expect.objectContaining({ zeilen: "typ", spalten: "jahr" }),
    );
    fireEvent.click(screen.getByLabelText("pivot.tauschen"));
    expect(useStatsHooks.useStatsPivot).toHaveBeenLastCalledWith(
      expect.objectContaining({ zeilen: "jahr", spalten: "typ" }),
    );
  });
});
