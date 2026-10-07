import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useStatsHooks from "../../hooks/useStats";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { PivotErgebnis } from "../../types/stats";
import OngletPivot from "./OngletPivot";

vi.mock("../../hooks/useStats", async () => {
  const actual = await vi.importActual<typeof useStatsHooks>("../../hooks/useStats");
  return { ...actual, useStatsPivot: vi.fn(), usePivotOptionen: vi.fn() };
});

const ergebnis: PivotErgebnis = {
  zeilen_dims: ["kategorie"],
  spalten_dims: ["jahr"],
  kennzahlen: ["einnahmen", "ausgaben", "saldo"],
  jahr_von: 2025,
  jahr_bis: 2026,
  filter: {},
  spalten: [
    { labels: ["2025"], label: "2025" },
    { labels: ["2026"], label: "2026" },
  ],
  zeilen: [
    {
      labels: ["Beiträge"],
      label: "Beiträge",
      werte: [
        [100, 30, 70],
        [45, 60, -15],
      ],
      summe: [145, 90, 55],
    },
  ],
  spalten_summen: [
    [100, 30, 70],
    [45, 60, -15],
  ],
  gesamt: [145, 90, 55],
  anzahl_buchungen: 4,
};

function letzteAbfrage() {
  const aufrufe = vi.mocked(useStatsHooks.useStatsPivot).mock.calls;
  return aufrufe[aufrufe.length - 1][0];
}

describe("OngletPivot", () => {
  beforeEach(() => {
    vi.mocked(useStatsHooks.useStatsPivot).mockReturnValue({
      data: ergebnis,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useStatsHooks.useStatsPivot>);
    vi.mocked(useStatsHooks.usePivotOptionen).mockReturnValue({
      data: { kategorie: ["Beiträge", "Material"], typ: ["einnahme", "ausgabe"] },
    } as unknown as ReturnType<typeof useStatsHooks.usePivotOptionen>);
  });

  it("zeigt Einnahmen, Ausgaben und Saldo getrennt je Spalte und in der Summe", () => {
    renderWithProviders(<OngletPivot />);
    expect(screen.getByText("Beiträge", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getAllByText("pivot.kz_einnahmen", { selector: "th" }).length).toBe(3);
    expect(screen.getAllByText("pivot.kz_ausgaben", { selector: "th" }).length).toBe(3);
    expect(screen.getAllByText("145,00 €").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("90,00 €").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("-15,00 €").length).toBeGreaterThanOrEqual(1);
  });

  it("fügt eine zweite Zeilendimension hinzu und entfernt sie wieder", () => {
    renderWithProviders(<OngletPivot />);
    fireEvent.change(screen.getByLabelText("pivot.zeilen"), { target: { value: "typ" } });
    expect(letzteAbfrage().zeilen).toEqual(["kategorie", "typ"]);
    const entfernen = screen.getAllByRole("button", { name: "pivot.entfernen" });
    fireEvent.click(entfernen[0]);
    expect(letzteAbfrage().zeilen).toEqual(["typ"]);
  });

  it("erlaubt höchstens drei Dimensionen je Achse und keine doppelten über Achsen", () => {
    renderWithProviders(<OngletPivot />);
    const zeilen = screen.getByLabelText("pivot.zeilen") as HTMLSelectElement;
    // "jahr" liegt schon in den Spalten und darf bei den Zeilen nicht angeboten werden
    expect([...zeilen.options].map((o) => o.value)).not.toContain("jahr");
    fireEvent.change(zeilen, { target: { value: "typ" } });
    fireEvent.change(screen.getByLabelText("pivot.zeilen"), { target: { value: "monat" } });
    expect(letzteAbfrage().zeilen).toEqual(["kategorie", "typ", "monat"]);
    expect(screen.getByLabelText("pivot.zeilen")).toBeDisabled();
  });

  it("schaltet Kennzahlen um, mindestens eine bleibt aktiv", () => {
    renderWithProviders(<OngletPivot />);
    fireEvent.click(screen.getByRole("button", { name: "pivot.kz_anzahl" }));
    expect(letzteAbfrage().kennzahlen).toEqual(["einnahmen", "ausgaben", "saldo", "anzahl"]);
    fireEvent.click(screen.getByRole("button", { name: "pivot.kz_einnahmen" }));
    fireEvent.click(screen.getByRole("button", { name: "pivot.kz_ausgaben" }));
    fireEvent.click(screen.getByRole("button", { name: "pivot.kz_saldo" }));
    fireEvent.click(screen.getByRole("button", { name: "pivot.kz_anzahl" }));
    expect(letzteAbfrage().kennzahlen).toEqual(["anzahl"]);
  });

  it("übernimmt Filter für Art und Kategorie und setzt sie zurück", () => {
    renderWithProviders(<OngletPivot />);
    fireEvent.change(screen.getByLabelText("pivot.filter_typ"), { target: { value: "ausgabe" } });
    fireEvent.click(screen.getByRole("button", { name: "Material" }));
    expect(letzteAbfrage()).toEqual(
      expect.objectContaining({ typ: "ausgabe", kategorie: ["Material"] }),
    );
    fireEvent.click(screen.getByRole("button", { name: "pivot.filter_zuruecksetzen" }));
    expect(letzteAbfrage()).toEqual(expect.objectContaining({ typ: "", kategorie: [] }));
  });

  it("tauscht Zeilen und Spalten", () => {
    renderWithProviders(<OngletPivot />);
    fireEvent.click(screen.getByLabelText("pivot.tauschen"));
    expect(letzteAbfrage()).toEqual(
      expect.objectContaining({ zeilen: ["jahr"], spalten: ["kategorie"] }),
    );
  });

  it("lässt die voreingestellte Zeilendimension entfernen (nur Gesamtzeile)", () => {
    renderWithProviders(<OngletPivot />);
    const entfernen = screen.getAllByRole("button", { name: "pivot.entfernen" });
    expect(entfernen[0]).toBeEnabled();
    fireEvent.click(entfernen[0]);
    expect(letzteAbfrage().zeilen).toEqual([]);
  });
});
