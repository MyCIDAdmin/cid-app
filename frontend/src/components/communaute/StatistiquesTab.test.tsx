import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { ClassementLigue, StatistiqueJoueur } from "../../types/communaute";
import StatistiquesTab from "./StatistiquesTab";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useClassementLigue: vi.fn(), useStatistiquesJoueurs: vi.fn() };
});

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function ligne(overrides: Partial<ClassementLigue> = {}): ClassementLigue {
  return {
    id: "l1",
    saison: "2025-2026",
    equipe: "Club Africain",
    rang: 1,
    joues: 10,
    victoires: 7,
    nuls: 2,
    defaites: 1,
    buts_pour: 20,
    buts_contre: 8,
    difference: 12,
    points: 23,
    forme_recente: "VVNDV",
    joues_domicile: 5,
    victoires_domicile: 4,
    nuls_domicile: 1,
    defaites_domicile: 0,
    buts_pour_domicile: 12,
    buts_contre_domicile: 3,
    points_domicile: 13,
    joues_exterieur: 5,
    victoires_exterieur: 3,
    nuls_exterieur: 1,
    defaites_exterieur: 1,
    buts_pour_exterieur: 8,
    buts_contre_exterieur: 5,
    points_exterieur: 10,
    zone_texte: "",
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

function joueur(overrides: Partial<StatistiqueJoueur> = {}): StatistiqueJoueur {
  return {
    id: "j1",
    saison: "2025-2026",
    equipe: "Club Africain",
    nom: "Sadok Kadida",
    numero: 9,
    poste: "Forwards",
    matchs_joues: 7,
    buts: 4,
    passes_decisives: 1,
    cartons_jaunes: 0,
    cartons_rouges: 0,
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

function mockClassement(...lignes: ClassementLigue[]) {
  vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
    data: page(lignes),
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);
}

function mockJoueurs(joueurs: StatistiqueJoueur[] = [], isLoading = false) {
  vi.mocked(useCommunauteHooks.useStatistiquesJoueurs).mockReturnValue({
    data: page(joueurs),
    isLoading,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useStatistiquesJoueurs>);
}

describe("StatistiquesTab", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);
    mockJoueurs();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_chargement")).toBeInTheDocument();
  });

  it("affiche un message si Club Africain est absent du classement", () => {
    mockClassement(ligne({ equipe: "ES Tunis" }));
    mockJoueurs();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_vide")).toBeInTheDocument();
  });

  it("affiche la forme récente de Club Africain sous forme de badges", () => {
    mockClassement(ligne({ forme_recente: "VVNDV" }));
    mockJoueurs();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_forme_titre")).toBeInTheDocument();
    expect(screen.getAllByText("V")).toHaveLength(3);
    expect(screen.getAllByText("N")).toHaveLength(1);
    expect(screen.getAllByText("D")).toHaveLength(1);
  });

  // Enrichissement 2026-09-24 ("Ich möchte mehr Statistiken darstellen") : comparaison à
  // la moyenne de la ligue + tordifférence de toutes les équipes — les deux graphiques
  // s'appuient sur le tableau COMPLET synchronisé depuis GOAL API, pas seulement Club
  // Africain.
  it("affiche les titres des graphiques de comparaison ligue et de tordifférence", () => {
    mockClassement(
      ligne({ equipe: "Club Africain", rang: 1, difference: 12 }),
      ligne({ equipe: "ES Tunis", rang: 2, difference: 3, buts_pour: 14, buts_contre: 9 }),
    );
    mockJoueurs();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_buts_titre")).toBeInTheDocument();
    expect(screen.getByText("live.statistiques_tordifferenz_titre")).toBeInTheDocument();
  });

  // Torschützen/Kartenstatistik (2026-09-24, bascule SerpApi → GOAL API) — voir docstring
  // de tête StatistiquesTab.tsx : dérivés de StatistiqueJoueur (effectif de Club Africain),
  // indisponibles sous SerpApi faute de données joueur pour la Ligue 1 tunisienne.
  it("affiche un message de chargement pour les listes joueurs tant qu'elles ne sont pas prêtes", () => {
    mockClassement(ligne());
    mockJoueurs([], true);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_torschuetzen_titre")).toBeInTheDocument();
    expect(screen.getByText("live.statistiques_karten_titre")).toBeInTheDocument();
  });

  it("affiche un message vide quand aucun joueur n'a marqué ni été sanctionné", () => {
    mockClassement(ligne());
    mockJoueurs([joueur({ buts: 0, cartons_jaunes: 0, cartons_rouges: 0 })]);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getAllByText("live.statistiques_vide")).toHaveLength(2);
  });

  it("classe les buteurs par nombre de buts décroissant", () => {
    mockClassement(ligne());
    mockJoueurs([
      joueur({ id: "j1", nom: "Sadok Kadida", buts: 4 }),
      joueur({ id: "j2", nom: "Taddeus Nkeng", buts: 6 }),
      joueur({ id: "j3", nom: "Ismaila Simpara", buts: 0 }),
    ]);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("Sadok Kadida")).toBeInTheDocument();
    expect(screen.getByText("Taddeus Nkeng")).toBeInTheDocument();
    expect(screen.queryByText("Ismaila Simpara")).not.toBeInTheDocument();
  });

  it("affiche les joueurs sanctionnés avec leur poste traduit", () => {
    mockClassement(ligne());
    mockJoueurs([
      joueur({
        id: "j2",
        nom: "Taddeus Nkeng",
        poste: "Midfielders",
        buts: 3,
        cartons_jaunes: 1,
        cartons_rouges: 0,
      }),
    ]);

    renderWithProviders(<StatistiquesTab />);

    // Apparaît à la fois dans Torschützen (3 buts) et Kartenstatistik (1 carton jaune).
    expect(screen.getAllByText("Taddeus Nkeng")).toHaveLength(2);
    expect(screen.getByText("live.statistiques_poste_milieu")).toBeInTheDocument();
  });
});
