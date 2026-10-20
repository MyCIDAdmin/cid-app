import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useZentralHooks from "../../hooks/useZentral";
import { renderWithProviders } from "../../test/renderWithProviders";
import ZentraleEinstellungenPage from "./ZentraleEinstellungenPage";

vi.mock("../../hooks/useZentral", () => ({
  useZentraleEinstellungen: vi.fn(),
  useAendereZentraleEinstellungen: vi.fn(),
}));

const STANDARD = {
  warenkorb_reservierung_minuten: 20,
  event_zahlungsfrist_tage: 2,
  hinweis_tage_vorher: 7,
  hinweis_plaetze_absolut: 5,
  hinweis_plaetze_prozent: 20,
  hinweis_lager_menge: 5,
  hinweis_max_anzahl: 3,
};

describe("ZentraleEinstellungenPage", () => {
  let mutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mutate = vi.fn();
    vi.mocked(useZentralHooks.useZentraleEinstellungen).mockReturnValue({
      data: {
        warenkorb_reservierung_minuten: 20,
        event_zahlungsfrist_tage: 2,
        hinweis_tage_vorher: 7,
        hinweis_plaetze_absolut: 5,
        hinweis_plaetze_prozent: 20,
        hinweis_lager_menge: 5,
        hinweis_max_anzahl: 3,
        modifie_par: null,
        updated_at: "x",
      },
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useZentralHooks.useAendereZentraleEinstellungen).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as never);
  });

  it("zeigt den aktuellen Wert und speichert eine Änderung", () => {
    renderWithProviders(<ZentraleEinstellungenPage />);
    const feld = screen.getByLabelText("feld.warenkorb_reservierung_minuten.label");
    expect(feld).toHaveValue(20);
    fireEvent.change(feld, { target: { value: "30" } });
    fireEvent.click(screen.getByText("speichern"));
    expect(mutate).toHaveBeenCalledWith(
      { ...STANDARD, warenkorb_reservierung_minuten: 30 },
      expect.any(Object),
    );
  });

  it("sperrt Speichern bei ungültigem Wert (0 oder zu groß)", () => {
    renderWithProviders(<ZentraleEinstellungenPage />);
    const feld = screen.getByLabelText("feld.warenkorb_reservierung_minuten.label");
    const knopf = screen.getByText("speichern");
    fireEvent.change(feld, { target: { value: "0" } });
    expect(knopf).toBeDisabled();
    fireEvent.change(feld, { target: { value: "1441" } });
    expect(knopf).toBeDisabled();
    fireEvent.change(feld, { target: { value: "1440" } });
    expect(knopf).toBeEnabled();
  });

  it("bietet die Zahlungsfrist für Veranstaltungen (1–30 Tage) an", () => {
    renderWithProviders(<ZentraleEinstellungenPage />);
    const feld = screen.getByLabelText("feld.event_zahlungsfrist_tage.label");
    expect(feld).toHaveValue(2);
    fireEvent.change(feld, { target: { value: "31" } });
    expect(screen.getByText("speichern")).toBeDisabled();
    fireEvent.change(feld, { target: { value: "3" } });
    fireEvent.click(screen.getByText("speichern"));
    expect(mutate).toHaveBeenCalledWith(
      { ...STANDARD, event_zahlungsfrist_tage: 3 },
      expect.any(Object),
    );
  });

  it("bietet alle Schwellen für die Hinweise und speichert sie", () => {
    renderWithProviders(<ZentraleEinstellungenPage />);
    const tage = screen.getByLabelText("feld.hinweis_tage_vorher.label");
    expect(tage).toHaveValue(7);
    expect(screen.getByLabelText("feld.hinweis_plaetze_absolut.label")).toHaveValue(5);
    expect(screen.getByLabelText("feld.hinweis_plaetze_prozent.label")).toHaveValue(20);
    expect(screen.getByLabelText("feld.hinweis_lager_menge.label")).toHaveValue(5);
    const maximum = screen.getByLabelText("feld.hinweis_max_anzahl.label");
    fireEvent.change(maximum, { target: { value: "11" } });
    expect(screen.getByText("speichern")).toBeDisabled();
    fireEvent.change(maximum, { target: { value: "4" } });
    fireEvent.change(tage, { target: { value: "10" } });
    fireEvent.click(screen.getByText("speichern"));
    expect(mutate).toHaveBeenCalledWith(
      { ...STANDARD, hinweis_max_anzahl: 4, hinweis_tage_vorher: 10 },
      expect.any(Object),
    );
  });
});
