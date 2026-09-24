import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { RencontreCalendrier } from "../../types/communaute";
import CalendrierTab from "./CalendrierTab";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useCalendrierRencontres: vi.fn() };
});

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function rencontre(overrides: Partial<RencontreCalendrier> = {}): RencontreCalendrier {
  return {
    id: "r1",
    competition: "Ligue 1",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: "2026-04-01T18:00:00Z",
    score_domicile: null,
    score_exterieur: null,
    est_a_venir: true,
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

describe("CalendrierTab", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_chargement")).toBeInTheDocument();
  });

  it("affiche un message d'erreur", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_erreur")).toBeInTheDocument();
  });

  it("affiche un message si le calendrier est vide", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_vide")).toBeInTheDocument();
  });

  it("sépare les rencontres à venir des résultats déjà joués", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({ id: "r1", equipe_exterieur: "ES Tunis", est_a_venir: true }),
        rencontre({
          id: "r2",
          equipe_exterieur: "CS Sfaxien",
          est_a_venir: false,
          score_domicile: 2,
          score_exterieur: 1,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText(/ES Tunis/)).toBeInTheDocument();
    expect(screen.getByText(/CS Sfaxien/)).toBeInTheDocument();
    expect(screen.getByText("2 : 1")).toBeInTheDocument();
  });

  // Badge de résultat (2026-09-24, "Ich möchte mehr Statistiken darstellen") — les scores
  // réels arrivent désormais via la requête SerpApi "<ligue> results" (voir services.py),
  // qui couvre TOUTE la ligue, pas seulement Club Africain : le badge ne doit apparaître
  // que pour les rencontres où Club Africain joue effectivement.
  it("affiche un badge Sieg quand Club Africain gagne à domicile", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Club Africain",
          equipe_exterieur: "Zarzis",
          est_a_venir: false,
          score_domicile: 1,
          score_exterieur: 0,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_resultat_sieg")).toBeInTheDocument();
  });

  it("affiche un badge Niederlage quand Club Africain perd à l'extérieur", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "CS Sfaxien",
          equipe_exterieur: "Club Africain",
          est_a_venir: false,
          score_domicile: 2,
          score_exterieur: 0,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_resultat_niederlage")).toBeInTheDocument();
  });

  it("n'affiche aucun badge de résultat pour un match sans Club Africain", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Ben Guerdane",
          equipe_exterieur: "CS Hammam-Lif",
          est_a_venir: false,
          score_domicile: 1,
          score_exterieur: 0,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.queryByText("live.calendrier_resultat_sieg")).not.toBeInTheDocument();
    expect(screen.queryByText("live.calendrier_resultat_niederlage")).not.toBeInTheDocument();
    expect(screen.queryByText("live.calendrier_resultat_unentschieden")).not.toBeInTheDocument();
  });

  it("n'affiche aucun badge de résultat tant que le match n'est pas encore joué", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Club Africain",
          equipe_exterieur: "TP Mazembe",
          est_a_venir: true,
          score_domicile: null,
          score_exterieur: null,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.queryByText("live.calendrier_resultat_sieg")).not.toBeInTheDocument();
  });
});
