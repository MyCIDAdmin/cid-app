import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { ClassementLigue } from "../../types/communaute";
import ClassementTab from "./ClassementTab";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useClassementLigue: vi.fn(), useEquipesLogos: vi.fn() };
});

// EquipeLogoImage (voir docstring de tête ClassementTab.tsx, retour utilisateur du
// 2026-09-28 "Fan-Club: Vereins-Logos anzeigen + Upload-Möglichkeit") appelle
// useEquipesLogos() en interne — mocké ici en liste vide pour ne dépendre d'aucun réseau ;
// son propre affichage (logo présent/absent) est couvert par EquipeLogoImage.test.tsx.
vi.mocked(useCommunauteHooks.useEquipesLogos).mockReturnValue({
  data: [],
  isLoading: false,
  isError: false,
} as unknown as ReturnType<typeof useCommunauteHooks.useEquipesLogos>);

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function ligne(overrides: Partial<ClassementLigue> = {}): ClassementLigue {
  return {
    id: "l1",
    saison: "2025-2026",
    equipe: "ES Tunis",
    rang: 2,
    joues: 10,
    victoires: 6,
    nuls: 2,
    defaites: 2,
    buts_pour: 18,
    buts_contre: 9,
    difference: 9,
    points: 20,
    forme_recente: "VVNDV",
    joues_domicile: 5,
    victoires_domicile: 4,
    nuls_domicile: 1,
    defaites_domicile: 0,
    buts_pour_domicile: 11,
    buts_contre_domicile: 3,
    points_domicile: 13,
    joues_exterieur: 5,
    victoires_exterieur: 2,
    nuls_exterieur: 1,
    defaites_exterieur: 2,
    buts_pour_exterieur: 7,
    buts_contre_exterieur: 6,
    points_exterieur: 7,
    zone_texte: "",
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

describe("ClassementTab", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("live.classement_chargement")).toBeInTheDocument();
  });

  it("affiche un message d'erreur", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("live.classement_erreur")).toBeInTheDocument();
  });

  it("affiche un message si le classement est vide", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("live.classement_vide")).toBeInTheDocument();
  });

  it("affiche le classement trié avec le rang, les points et la forme récente", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([
        ligne({ id: "l1", equipe: "Club Africain", rang: 1, points: 24, forme_recente: "VVVND" }),
        ligne({ id: "l2", equipe: "ES Tunis", rang: 2 }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("Club Africain")).toBeInTheDocument();
    expect(screen.getByText("ES Tunis")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("VVVND")).toBeInTheDocument();
  });

  // Bascule Gesamt/Heim/Auswärts (2026-09-24, bascule SerpApi → GOAL API) — voir docstring
  // de tête ClassementTab.tsx : GOAL API fournit nativement une répartition domicile/
  // extérieur, absente sous SerpApi.
  it("bascule vers les statistiques à domicile au clic sur Heim", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([
        ligne({
          id: "l1",
          equipe: "Club Africain",
          points: 24,
          points_domicile: 15,
          joues_domicile: 5,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("24")).toBeInTheDocument();

    fireEvent.click(screen.getByText("live.classement_vue_domicile"));

    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.queryByText("24")).not.toBeInTheDocument();
  });

  it("affiche le texte de zone qualificative/relégation quand présent", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([
        ligne({
          id: "l1",
          equipe: "Club Africain",
          zone_texte: "Promotion - CAF Champions League",
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("Promotion - CAF Champions League")).toBeInTheDocument();
  });
});
