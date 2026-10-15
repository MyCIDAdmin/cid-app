import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import WettbewerbBuero from "./WettbewerbBuero";

vi.mock("../../hooks/useRegionen", () => ({
  useJournal: vi.fn(),
  useKorrekturBuchen: vi.fn(),
}));

const saison = {
  id: "s1",
  name: "Saison 2026/27",
  start: "2026-09-01",
  ende: "2027-08-31",
  preis: "",
  eingefroren: false,
  laufend: true,
};
const regionen = [{ slug: "nord", name: "Nord", farbe: "#0e7490" }];
const buchen = vi.fn();

function mock(eingefroren = false) {
  vi.mocked(hooks.useKorrekturBuchen).mockReturnValue({
    mutate: buchen,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useKorrekturBuchen>);
  vi.mocked(hooks.useJournal).mockReturnValue({
    data: {
      gesamt: 30,
      ergebnisse: [
        {
          id: "e1",
          saison: "Saison 2026/27",
          region: { slug: "nord", name: "Nord" },
          grund: "korrektur",
          punkte: -5,
          anzahl: 0,
          veranstaltung: null,
          datum: "2026-10-12",
          begruendung: "Doppelt gebucht",
          von: "Büro Alex",
          erstellt_am: "2026-10-12T10:00:00Z",
        },
      ],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useJournal>);
  return { ...saison, eingefroren };
}

describe("WettbewerbBuero", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt das Journal mit Begründung und Urheber", () => {
    renderWithProviders(<WettbewerbBuero saison={mock()} regionen={regionen} />);
    const zeile = screen.getByText(/Doppelt gebucht/).closest("tr") as HTMLElement;
    expect(zeile).toHaveTextContent("-5");
    expect(zeile).toHaveTextContent("wettbewerb.grund.korrektur");
    expect(zeile).toHaveTextContent("Büro Alex");
  });

  it("bucht eine Korrektur nur mit Region, Punkten ungleich 0 und Begründung", () => {
    renderWithProviders(<WettbewerbBuero saison={mock()} regionen={regionen} />);
    const knopf = screen.getByText("wettbewerb.korrektur_buchen");
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByLabelText("wettbewerb.korrektur_region"), {
      target: { value: "nord" },
    });
    fireEvent.change(screen.getByLabelText("wettbewerb.korrektur_punkte"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("wettbewerb.korrektur_begruendung"), {
      target: { value: " Fehlbuchung " },
    });
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByLabelText("wettbewerb.korrektur_punkte"), {
      target: { value: "-10" },
    });
    fireEvent.click(knopf);
    expect(buchen).toHaveBeenCalledWith(
      { region: "nord", punkte: -10, begruendung: "Fehlbuchung", saison: "s1" },
      expect.any(Object),
    );
  });

  it("sperrt Korrekturen in einer eingefrorenen Saison", () => {
    renderWithProviders(<WettbewerbBuero saison={mock(true)} regionen={regionen} />);
    expect(screen.getByText("wettbewerb.eingefroren_hinweis")).toBeInTheDocument();
    expect(screen.queryByText("wettbewerb.korrektur_buchen")).not.toBeInTheDocument();
  });

  it("lädt weitere Journal-Zeilen", () => {
    renderWithProviders(<WettbewerbBuero saison={mock()} regionen={regionen} />);
    fireEvent.click(screen.getByText("wettbewerb.mehr"));
    expect(hooks.useJournal).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, saison: "s1" }),
    );
  });
});
