import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Wettbewerb } from "../../types/regionen";
import WettbewerbPage from "./WettbewerbPage";

vi.mock("../../components/regionen/WettbewerbBuero", () => ({
  default: () => <div data-testid="buero" />,
}));
vi.mock("../../components/regionen/WettbewerbAdmin", () => ({
  default: () => <div data-testid="admin" />,
}));
vi.mock("../../hooks/useRegionen", () => ({ useWettbewerb: vi.fn() }));

const saison = {
  id: "s1",
  name: "Saison 2026/27",
  start: "2026-09-01",
  ende: "2027-08-31",
  preis: "Ein Grillabend",
  eingefroren: false,
  laufend: true,
};

function daten(o: Partial<Wettbewerb> = {}): Wettbewerb {
  return {
    saisons: [saison],
    saison,
    regeln: {
      punkte_veranstaltung: 50,
      punkte_anwesend: 2,
      max_anwesende: 25,
      punkte_erstteilnehmer: 3,
      punkte_neumitglied: 20,
      max_treffen_monat: 8,
    },
    ewige_tabelle: [],
    darf_verwalten: false,
    ist_admin: false,
    rangliste: [
      {
        rang: 1,
        region: { slug: "nord", name: "Nord", farbe: "#0e7490" },
        punkte: 110,
        mitglieder: 4,
        punkte_pro_mitglied: 27.5,
        treffen: 2,
        abzeichen: [{ key: "erstes_treffen", anzahl: 1 }],
      },
      {
        rang: 2,
        region: { slug: "sued", name: "Süd", farbe: "#b45309" },
        punkte: 50,
        mitglieder: 5,
        punkte_pro_mitglied: 10,
        treffen: 1,
        abzeichen: [],
      },
    ],
    verlauf: {
      monate: ["2026-09", "2026-10"],
      serien: [{ slug: "nord", name: "Nord", farbe: "#0e7490", werte: [50, 110] }],
    },
    monatssieger: [{ monat: "2026-09", regionen: ["nord"] }],
    ...o,
  };
}

function mock(data: unknown, extra: Record<string, unknown> = {}) {
  vi.mocked(hooks.useWettbewerb).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof hooks.useWettbewerb>);
}

describe("WettbewerbPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Laden und Fehler", () => {
    mock(undefined, { isLoading: true });
    const { unmount } = renderWithProviders(<WettbewerbPage />);
    expect(screen.getByText("laden")).toBeInTheDocument();
    unmount();
    mock(undefined, { isError: true });
    renderWithProviders(<WettbewerbPage />);
    expect(screen.getByText("wettbewerb.fehler_laden")).toBeInTheDocument();
  });

  it("zeigt Rangliste, Preis, Abzeichen, Monatssieger und Regeln, aber keine Verwaltung", () => {
    mock(daten());
    renderWithProviders(<WettbewerbPage />);
    const zeilen = screen.getAllByRole("row");
    expect(zeilen).toHaveLength(3);
    expect(zeilen[1]).toHaveTextContent("Nord");
    expect(zeilen[1]).toHaveTextContent(/27[.,]5/);
    expect(zeilen[1]).toHaveTextContent("wettbewerb.abzeichen.erstes_treffen");
    expect(screen.getByRole("link", { name: "Nord" })).toHaveAttribute("href", "/regionen/nord");
    expect(screen.getByText("Ein Grillabend")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "wettbewerb.verlauf_aria" })).toBeInTheDocument();
    expect(screen.getByText("wettbewerb.monatssieger")).toBeInTheDocument();
    expect(screen.getByText("wettbewerb.regel_treffen")).toBeInTheDocument();
    expect(screen.queryByTestId("buero")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin")).not.toBeInTheDocument();
  });

  it("zeigt Büro und Admin nur mit Berechtigung", () => {
    mock(daten({ darf_verwalten: true, ist_admin: true }));
    renderWithProviders(<WettbewerbPage />);
    expect(screen.getByTestId("buero")).toBeInTheDocument();
    expect(screen.getByTestId("admin")).toBeInTheDocument();
  });

  it("meldet, wenn keine Saison läuft, und wählt frühere Saisons", () => {
    mock(daten({ saison: null, rangliste: [], saisons: [] }));
    const { unmount } = renderWithProviders(<WettbewerbPage />);
    expect(screen.getByText("wettbewerb.keine_saison")).toBeInTheDocument();
    unmount();
    const alt = { ...saison, id: "s0", name: "Saison 2025/26", eingefroren: true, laufend: false };
    mock(daten({ saisons: [alt, saison] }));
    renderWithProviders(<WettbewerbPage />);
    fireEvent.change(screen.getByLabelText("wettbewerb.saison"), { target: { value: "s0" } });
    expect(hooks.useWettbewerb).toHaveBeenLastCalledWith("s0");
  });
});
