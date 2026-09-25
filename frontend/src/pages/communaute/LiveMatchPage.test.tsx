import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Match } from "../../types/communaute";
import LiveMatchPage from "./LiveMatchPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useMatchs: vi.fn(),
    useCreerMatch: vi.fn(),
    useClassementLigue: vi.fn(),
    useCalendrierRencontres: vi.fn(),
    useStatistiquesJoueurs: vi.fn(),
    useEquipeInfo: vi.fn(),
    useTippspiele: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const admin = { ...membre, id: "u2", role: "bureau_admin" as const };

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: "m1",
    adversaire: "ES Tunis",
    competition: "Ligue 1",
    lieu: "Stade Olympique de Radès",
    date_heure: "2026-03-01T18:00:00Z",
    statut: "a_venir",
    score_ca: 0,
    score_adversaire: 0,
    minute_chrono: 0,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    reactions: { coeur: 0, feu: 0, etoile: 0, surprise: 0 },
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

describe("LiveMatchPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useCreerMatch).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerMatch>>(),
    );
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
    // StatistiquesTab (2026-09-24, redesign dashboard) — appelés inconditionnellement par
    // le composant même quand le classement est vide (garde précoce sur clubAfricain
    // absent), voir StatistiquesTab.test.tsx pour la couverture détaillée de ces hooks.
    vi.mocked(useCommunauteHooks.useStatistiquesJoueurs).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useStatistiquesJoueurs>);
    vi.mocked(useCommunauteHooks.useEquipeInfo).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useEquipeInfo>);
    // TippspielSection (2026-09-24, onglet Ticker) : aucun jeu par défaut — un membre
    // standard ne voit alors rien (voir TippspielSection.tsx), ce qui laisse les
    // assertions existantes de ce fichier inchangées.
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
  });

  it("affiche la liste des matchs avec leur statut", () => {
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([match()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    expect(screen.getByText(/ES Tunis/)).toBeInTheDocument();
    expect(screen.getByText("live.statut_a_venir")).toBeInTheDocument();
  });

  it("affiche un message si aucun match", () => {
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    expect(screen.getByText("live.aucun_match")).toBeInTheDocument();
  });

  it("masque le bouton de création à un membre standard", () => {
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    expect(screen.queryByText("live.nouveau_match")).not.toBeInTheDocument();
  });

  it("permet à un Bureau Admin+ de créer un match", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: admin, isAuthenticated: true });
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerMatch>>();
    vi.mocked(useCommunauteHooks.useCreerMatch).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    fireEvent.click(screen.getByText("live.nouveau_match"));
    fireEvent.change(screen.getByPlaceholderText("live.adversaire_placeholder"), {
      target: { value: "ES Tunis" },
    });
    fireEvent.change(screen.getByLabelText("live.date_heure_label"), {
      target: { value: "2026-03-01T18:00" },
    });
    fireEvent.click(screen.getByText("live.creer"));

    expect(creer.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ adversaire: "ES Tunis" }),
      expect.anything(),
    );
  });

  // --- Fan-Club — conteneur à onglets (2026-09-24) ---

  it("affiche l'onglet Ticker par défaut et masque les autres contenus", () => {
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([match()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    expect(screen.getByText(/ES Tunis/)).toBeInTheDocument();
    expect(screen.queryByText("live.classement_vide")).not.toBeInTheDocument();
  });

  it("bascule vers l'onglet Tabelle et masque le bouton de création de match", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: admin, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([match()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    fireEvent.click(screen.getByText("live.onglet_tabelle"));

    expect(screen.getByText("live.classement_vide")).toBeInTheDocument();
    expect(screen.queryByText(/ES Tunis/)).not.toBeInTheDocument();
    expect(screen.queryByText("live.nouveau_match")).not.toBeInTheDocument();
  });

  it("bascule vers l'onglet Spielplan", () => {
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    fireEvent.click(screen.getByText("live.onglet_spielplan"));

    expect(screen.getByText("live.calendrier_vide")).toBeInTheDocument();
  });

  it("bascule vers l'onglet Statistiken", () => {
    vi.mocked(useCommunauteHooks.useMatchs).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchs>);

    renderWithProviders(<LiveMatchPage />);

    fireEvent.click(screen.getByText("live.onglet_statistiken"));

    expect(screen.getByText("live.statistiques_vide")).toBeInTheDocument();
  });
});
