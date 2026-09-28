import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { RencontreCalendrier } from "../../types/communaute";
import NextMatchTile from "./NextMatchTile";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useCalendrierRencontres: vi.fn(), useEquipesLogos: vi.fn() };
});

// EquipeLogoImage (retour utilisateur du 2026-09-28 "Fan-Club: Vereins-Logos anzeigen +
// Upload-Möglichkeit") appelle useEquipesLogos() en interne — mocké ici en liste vide pour
// ne dépendre d'aucun réseau ; son propre affichage est couvert par EquipeLogoImage.test.tsx.
vi.mocked(useCommunauteHooks.useEquipesLogos).mockReturnValue({
  data: [],
  isLoading: false,
  isError: false,
} as unknown as ReturnType<typeof useCommunauteHooks.useEquipesLogos>);

function rencontre(overrides: Partial<RencontreCalendrier>): RencontreCalendrier {
  return {
    id: "r1",
    competition: "Ligue 1 Tunisie",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "EST",
    date_heure: "2099-01-01T18:00:00Z",
    score_domicile: null,
    score_exterieur: null,
    statut: "SCHEDULED",
    est_a_venir: true,
    maj_le: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockRencontres(results: RencontreCalendrier[]) {
  vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
    data: { next: null, previous: null, results },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
}

describe("NextMatchTile", () => {
  it("n'affiche rien tant qu'aucune rencontre à venir n'est connue", () => {
    mockRencontres([]);
    const { container } = renderWithProviders(<NextMatchTile />);
    expect(container).toBeEmptyDOMElement();
  });

  it("n'affiche rien s'il n'y a que des rencontres déjà jouées", () => {
    mockRencontres([
      rencontre({ id: "r2", est_a_venir: false, date_heure: "2020-01-01T18:00:00Z" }),
    ]);
    const { container } = renderWithProviders(<NextMatchTile />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche la rencontre à venir la plus proche parmi plusieurs", () => {
    mockRencontres([
      rencontre({ id: "loin", equipe_exterieur: "Loin", date_heure: "2099-06-01T18:00:00Z" }),
      rencontre({ id: "proche", equipe_exterieur: "Proche", date_heure: "2099-01-01T18:00:00Z" }),
    ]);
    renderWithProviders(<NextMatchTile />);
    expect(screen.getByText("Club Africain — Proche")).toBeInTheDocument();
    expect(screen.queryByText("Club Africain — Loin")).not.toBeInTheDocument();
  });

  it("affiche « aujourd'hui » quand la rencontre a lieu le jour même", () => {
    const dansUneHeure = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockRencontres([rencontre({ date_heure: dansUneHeure })]);
    renderWithProviders(<NextMatchTile />);
    expect(screen.getByText("nextMatch.aujourdhui")).toBeInTheDocument();
  });
});
