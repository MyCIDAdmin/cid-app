import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { MatrixZeile, TippspielMatrix } from "../../types/communaute";
import TippspielAuswertung from "./TippspielAuswertung";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useTippspielMatrix: vi.fn(), useEquipesLogos: vi.fn() };
});

vi.mocked(useCommunauteHooks.useEquipesLogos).mockReturnValue({
  data: [],
} as unknown as ReturnType<typeof useCommunauteHooks.useEquipesLogos>);

function zeile(
  extra: Partial<MatrixZeile> & Pick<MatrixZeile, "name" | "rang" | "punkte">,
): MatrixZeile {
  return {
    rang_vorher: null,
    ist_ich: false,
    exakt: 0,
    letzte_punkte: null,
    tipps: {},
    ...extra,
  };
}

const spalten = [
  {
    id: "s1",
    competition: "Ligue 1",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: "2026-10-01T18:00:00Z",
    score_domicile: 2,
    score_exterieur: 1,
    statut: "FINISHED" as const,
  },
  {
    id: "s2",
    competition: "Ligue 1",
    equipe_domicile: "CS Sfaxien",
    equipe_exterieur: "Club Africain",
    date_heure: "2026-10-08T18:00:00Z",
    score_domicile: null,
    score_exterieur: null,
    statut: "SCHEDULED" as const,
  },
];

function matrix(sichtbar = true): TippspielMatrix {
  return {
    tippspiel: "tp1",
    tipps_sichtbar: sichtbar,
    teilnehmer: 3,
    letztes_spiel: "s1",
    spalten: sichtbar ? spalten : [],
    zeilen: [
      zeile({
        name: "Sana W.",
        rang: 1,
        rang_vorher: 3,
        punkte: 8,
        exakt: 1,
        letzte_punkte: 1,
        tipps: sichtbar ? { s1: { d: 2, e: 1, p: 4 }, s2: { d: 0, e: 0, p: null } } : {},
      }),
      zeile({
        name: "Riadh B.",
        rang: 2,
        rang_vorher: 1,
        punkte: 6,
        ist_ich: true,
        letzte_punkte: 4,
        tipps: sichtbar ? { s1: { d: 1, e: 0, p: 2 }, s2: { d: 1, e: 2, p: null } } : {},
      }),
      zeile({
        name: "Mehdi T.",
        rang: 3,
        rang_vorher: 3,
        punkte: 2,
        letzte_punkte: 0,
        tipps: sichtbar ? { s1: { d: 2, e: 1, p: 4 } } : {},
      }),
    ],
  };
}

function zeigeMatrix(daten: TippspielMatrix | undefined) {
  vi.mocked(useCommunauteHooks.useTippspielMatrix).mockReturnValue({
    data: daten,
  } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielMatrix>);
  return renderWithProviders(<TippspielAuswertung tippspielId="tp1" classement={[]} />);
}

describe("TippspielAuswertung", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt ohne Matrix-Daten die bisherige Rangliste", () => {
    vi.mocked(useCommunauteHooks.useTippspielMatrix).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielMatrix>);
    renderWithProviders(
      <TippspielAuswertung
        tippspielId="tp1"
        classement={[{ id: "t1", membre_nom: "Alt Eintrag", total_points: 5 } as never]}
      />,
    );
    expect(screen.getByText("Alt Eintrag")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("zeigt Rangliste mit Podium, Trend und exakten Treffern", () => {
    zeigeMatrix(matrix());
    const podium = within(screen.getByTestId("tippspiel-podium"));
    expect(podium.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("▲2")).toBeInTheDocument(); // Sana von 3 auf 1
    expect(screen.getByText("▼1")).toBeInTheDocument(); // Riadh von 1 auf 2
    expect(screen.getByText("(tippspiel.du)")).toBeInTheDocument();
  });

  it("sortiert nach dem letzten Spieltag um", () => {
    zeigeMatrix(matrix());
    fireEvent.click(screen.getByRole("button", { name: "tippspiel.zeitraum_letzter" }));
    const zeilen = screen.getAllByRole("row").slice(1);
    expect(zeilen[0]).toHaveTextContent("Riadh B.");
    expect(zeilen[0]).toHaveTextContent("4");
    // Trend gehört zur Gesamtwertung, nicht zum einzelnen Spieltag
    expect(screen.queryByText("▲2")).not.toBeInTheDocument();
  });

  it("zeigt in der Matrix die Tipps aller Teilnehmer je Spiel", () => {
    zeigeMatrix(matrix());
    fireEvent.click(screen.getByRole("tab", { name: "tippspiel.ansicht_matrix" }));
    const tabelle = within(screen.getByTestId("tippspiel-matrix"));
    expect(tabelle.getByText("ES Tunis")).toBeInTheDocument();
    expect(tabelle.getByText("CS Sfaxien")).toBeInTheDocument();
    expect(tabelle.getAllByText("2:1")).toHaveLength(2);
    expect(tabelle.getByText("1:0")).toBeInTheDocument();
    // Mehdi hat für das zweite Spiel nicht getippt
    expect(tabelle.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("verbirgt Tipps vor Nicht-Teilnehmern, zeigt aber die Rangliste", () => {
    zeigeMatrix(matrix(false));
    expect(screen.getAllByText("Sana W.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "tippspiel.ansicht_matrix" }));
    expect(screen.getByTestId("tipps-nicht-sichtbar")).toBeInTheDocument();
    expect(screen.queryByTestId("tippspiel-matrix")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "tippspiel.ansicht_wand" }));
    expect(screen.getByTestId("tipps-nicht-sichtbar")).toBeInTheDocument();
  });

  it("gruppiert in der Tipp-Wand gleiche Tipps und wechselt das Spiel", () => {
    zeigeMatrix(matrix());
    fireEvent.click(screen.getByRole("tab", { name: "tippspiel.ansicht_wand" }));
    // Vorgabe: jüngstes gesperrtes Spiel (s2) mit zwei verschiedenen Tipps
    expect(within(screen.getByTestId("tippwand")).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("tippspiel.wand_spiel_waehlen"), {
      target: { value: "s1" },
    });
    const gruppen = within(screen.getByTestId("tippwand")).getAllByRole("listitem");
    expect(gruppen).toHaveLength(2);
    expect(gruppen[0]).toHaveTextContent("2 : 1");
    expect(gruppen[0]).toHaveTextContent("Sana W., Mehdi T.");
  });

  it("meldet, dass noch keine Spiele gesperrt sind", () => {
    const leer = { ...matrix(), spalten: [] };
    zeigeMatrix(leer);
    fireEvent.click(screen.getByRole("tab", { name: "tippspiel.ansicht_matrix" }));
    expect(screen.getByText("tippspiel.matrix_leer")).toBeInTheDocument();
  });
});
