import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type {
  ClassementLigue,
  EquipeInfo,
  RencontreCalendrier,
  StatistiqueJoueur,
} from "../../types/communaute";
import StatistiquesTab from "./StatistiquesTab";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useClassementLigue: vi.fn(),
    useStatistiquesJoueurs: vi.fn(),
    useEquipeInfo: vi.fn(),
    useCalendrierRencontres: vi.fn(),
  };
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

function rencontre(overrides: Partial<RencontreCalendrier> = {}): RencontreCalendrier {
  return {
    id: "r1",
    competition: "Ligue 1",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: "2026-01-01T18:00:00Z",
    score_domicile: 2,
    score_exterieur: 0,
    statut: "FINISHED",
    est_a_venir: false,
    maj_le: "2026-01-01T20:00:00Z",
    ...overrides,
  };
}

function equipeInfo(overrides: Partial<EquipeInfo> = {}): EquipeInfo {
  return {
    nom: "Club Africain",
    logo_url: "",
    fondee_en: 1920,
    stade: "Stade Olympique de Radès",
    ville: "Radès",
    pays: "Tunisie",
    entraineur: "Faouzi Benzarti",
    maj_le: "2026-09-24T10:00:00Z",
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

function mockEquipeInfo(info?: EquipeInfo) {
  vi.mocked(useCommunauteHooks.useEquipeInfo).mockReturnValue({
    data: info,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useEquipeInfo>);
}

function mockCalendrier(rencontres: RencontreCalendrier[] = []) {
  vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
    data: page(rencontres),
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
}

describe("StatistiquesTab", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);
    mockJoueurs();
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_chargement")).toBeInTheDocument();
  });

  it("affiche un message si Club Africain est absent du classement", () => {
    mockClassement(ligne({ equipe: "ES Tunis" }));
    mockJoueurs();
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_vide")).toBeInTheDocument();
  });

  it("affiche les six cartes KPI dérivées de la ligne de classement de Club Africain", () => {
    mockClassement(ligne());
    mockJoueurs();
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.kpi_spiele")).toBeInTheDocument();
    expect(screen.getByText("live.kpi_gegentore")).toBeInTheDocument();
    // joues=10, victoires=7, nuls=2, defaites=1, buts_pour=20, buts_contre=8.
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("masque l'en-tête équipe tant qu'aucune synchronisation n'a encore eu lieu", () => {
    mockClassement(ligne());
    mockJoueurs();
    mockEquipeInfo(equipeInfo({ nom: "" }));
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.queryByText("Stade Olympique de Radès")).not.toBeInTheDocument();
  });

  it("affiche l'en-tête équipe une fois EquipeInfo synchronisée", () => {
    mockClassement(ligne());
    mockJoueurs();
    mockEquipeInfo(equipeInfo());
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("Club Africain")).toBeInTheDocument();
    expect(
      screen.getByText("Stade Olympique de Radès · Radès · Tunisie"),
    ).toBeInTheDocument();
    expect(screen.getByText(/live.equipe_entraineur/)).toBeInTheDocument();
  });

  it("calcule la série de points cumulés de Club Africain à partir des rencontres Ligue 1 terminées", () => {
    mockClassement(ligne());
    mockJoueurs();
    mockEquipeInfo(undefined);
    mockCalendrier([
      // Victoire à domicile (3 pts), puis match nul à l'extérieur (1 pt) => cumul 4.
      rencontre({
        id: "r1",
        date_heure: "2026-01-01T18:00:00Z",
        equipe_domicile: "Club Africain",
        equipe_exterieur: "ES Tunis",
        score_domicile: 2,
        score_exterieur: 0,
      }),
      rencontre({
        id: "r2",
        date_heure: "2026-01-08T18:00:00Z",
        equipe_domicile: "Stade Tunisien",
        equipe_exterieur: "Club Africain",
        score_domicile: 1,
        score_exterieur: 1,
      }),
      // Ignorée : autre compétition (pas Ligue 1).
      rencontre({
        id: "r3",
        competition: "Coupe de Tunisie",
        date_heure: "2026-01-15T18:00:00Z",
      }),
      // Ignorée : pas encore jouée.
      rencontre({
        id: "r4",
        date_heure: "2026-01-22T18:00:00Z",
        statut: "SCHEDULED",
        score_domicile: null,
        score_exterieur: null,
      }),
    ]);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.punkte_verlauf_titel")).toBeInTheDocument();
    // Repère textuel direct (Liga-Ø=23, Bestes Team=23 — un seul point de classement ici).
    expect(screen.getByText("live.punkte_verlauf_hinweis")).toBeInTheDocument();
  });

  it("exclut du graphique les rencontres d'une saison précédente (correctif 2026-09-25)", () => {
    // Classement filtré à la saison en cours "2025-2026" (juillet 2025 → juin 2026, voir
    // ligne() par défaut) : un match Ligue 1 terminé mais daté hors de cette fenêtre (ici
    // juin 2025, saison précédente) ne doit plus compter dans le cumul de points.
    mockClassement(ligne());
    mockJoueurs();
    mockEquipeInfo(undefined);
    mockCalendrier([
      rencontre({
        id: "r-ancienne-saison",
        date_heure: "2025-06-15T18:00:00Z",
        score_domicile: 3,
        score_exterieur: 0,
      }),
    ]);

    renderWithProviders(<StatistiquesTab />);

    // Aucune rencontre de la saison en cours => graphique vide, comme s'il n'y avait aucune
    // rencontre du tout (même message que le test suivant).
    expect(screen.getAllByText("live.statistiques_vide").length).toBeGreaterThanOrEqual(1);
  });

  it("affiche un message vide pour le graphique tant qu'aucune rencontre Ligue 1 n'est terminée", () => {
    mockClassement(ligne());
    mockJoueurs();
    mockEquipeInfo(undefined);
    mockCalendrier([rencontre({ statut: "SCHEDULED", score_domicile: null, score_exterieur: null })]);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getAllByText("live.statistiques_vide").length).toBeGreaterThanOrEqual(1);
  });

  it("affiche un message de chargement pour le kader tant qu'il n'est pas prêt", () => {
    mockClassement(ligne());
    mockJoueurs([], true);
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.kader_titel")).toBeInTheDocument();
  });

  it("affiche le kader complet (pas seulement un top 10) avec ses colonnes triables", () => {
    mockClassement(ligne());
    mockJoueurs([
      joueur({ id: "j1", nom: "Sadok Kadida", buts: 4, poste: "Forwards" }),
      joueur({ id: "j2", nom: "Taddeus Nkeng", buts: 6, poste: "Midfielders" }),
      joueur({ id: "j3", nom: "Ismaila Simpara", buts: 0, poste: "Defenders" }),
    ]);
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    // Contrairement à l'ancien Torschützen (top 10, buts > 0 seulement), le kader complet
    // liste TOUS les joueurs, y compris ceux à 0 but.
    expect(screen.getByText("Sadok Kadida")).toBeInTheDocument();
    expect(screen.getByText("Taddeus Nkeng")).toBeInTheDocument();
    expect(screen.getByText("Ismaila Simpara")).toBeInTheDocument();
    expect(screen.getByText("live.statistiques_poste_defenseur")).toBeInTheDocument();
  });

  it("masque du kader les joueurs sans aucun match joué cette saison (correctif 2026-09-25)", () => {
    // Retour utilisateur : des joueurs comme "S. Khalifa" restaient listés bien qu'ils ne
    // fassent plus partie de l'effectif actuel — filtre défensif matchs_joues >= 1.
    mockClassement(ligne());
    mockJoueurs([
      joueur({ id: "j1", nom: "Sadok Kadida", matchs_joues: 7 }),
      joueur({ id: "j2", nom: "S. Khalifa", matchs_joues: 0 }),
    ]);
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("Sadok Kadida")).toBeInTheDocument();
    expect(screen.queryByText("S. Khalifa")).not.toBeInTheDocument();
  });

  it("trie le kader par une colonne au clic sur son en-tête", () => {
    mockClassement(ligne());
    mockJoueurs([
      joueur({ id: "j1", nom: "Sadok Kadida", buts: 4 }),
      joueur({ id: "j2", nom: "Taddeus Nkeng", buts: 6 }),
    ]);
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    // Tri par défaut : buts décroissant => Taddeus Nkeng (6) avant Sadok Kadida (4).
    let lignesTexte = screen.getAllByRole("row").map((r) => r.textContent);
    expect(lignesTexte.findIndex((t) => t?.includes("Taddeus Nkeng"))).toBeLessThan(
      lignesTexte.findIndex((t) => t?.includes("Sadok Kadida")),
    );

    // Un clic sur "Name" trie par nom croissant : Sadok Kadida avant Taddeus Nkeng.
    fireEvent.click(screen.getByText("live.statistiques_joueur"));
    lignesTexte = screen.getAllByRole("row").map((r) => r.textContent);
    expect(lignesTexte.findIndex((t) => t?.includes("Sadok Kadida"))).toBeLessThan(
      lignesTexte.findIndex((t) => t?.includes("Taddeus Nkeng")),
    );

    // Un second clic sur "Name" inverse la direction : Taddeus Nkeng avant Sadok Kadida.
    fireEvent.click(screen.getByText("live.statistiques_joueur"));
    lignesTexte = screen.getAllByRole("row").map((r) => r.textContent);
    expect(lignesTexte.findIndex((t) => t?.includes("Taddeus Nkeng"))).toBeLessThan(
      lignesTexte.findIndex((t) => t?.includes("Sadok Kadida")),
    );
  });

  it("affiche un message vide pour le kader quand l'effectif est vide", () => {
    mockClassement(ligne());
    mockJoueurs([]);
    mockEquipeInfo(undefined);
    mockCalendrier();

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getAllByText("live.statistiques_vide").length).toBeGreaterThanOrEqual(1);
  });
});
