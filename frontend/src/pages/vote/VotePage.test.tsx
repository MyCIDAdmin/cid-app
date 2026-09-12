import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useVoteHooks from "../../hooks/useVote";
import * as useVoteSocketModule from "../../hooks/useVoteSocket";
import { useAuthStore } from "../../store/authStore";
import type { Resultats, VotePage as VotePageType, VoteSession } from "../../types/vote";
import VotePage from "./VotePage";

vi.mock("../../hooks/useVote", async () => {
  const actual = await vi.importActual<typeof useVoteHooks>("../../hooks/useVote");
  return {
    ...actual,
    useSessionVoteActive: vi.fn(),
    useVoteSession: vi.fn(),
    useCloturerVoteSession: vi.fn(),
    useHistoriqueVote: vi.fn(),
    useResultatsVote: vi.fn(),
  };
});

vi.mock("../../hooks/useVoteSocket", () => ({ useVoteSocket: vi.fn() }));

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const bureauAdmin = { ...membre, id: "u2", email: "admin@example.com", role: "bureau_admin" as const };

const sessionOuverte: VoteSession = {
  id: "s1",
  titre: "Élection du Bureau",
  description: "Choisissez le nouveau président.",
  type_vote: "unique",
  mode_anonymat: "anonyme",
  nb_choix_max: 1,
  eligibilite: "tous_actifs",
  duree_minutes: 30,
  quorum_pct: null,
  statut: "ouverte",
  date_ouverture: "2026-01-01T10:00:00Z",
  date_fin: new Date(Date.now() + 60_000).toISOString(),
  date_cloture: null,
  options: [
    { id: "o1", label: "Candidat A", description: "", ordre: 0 },
    { id: "o2", label: "Candidat B", description: "", ordre: 1 },
  ],
  total_participants: 3,
  total_eligibles: 10,
  resultats_visibles: false,
  created_by: 1,
  created_at: "2026-01-01T10:00:00Z",
};

function page<T>(results: T[]): VotePageType<T> {
  return { count: results.length, next: null, previous: null, results };
}

function socketDefaut(overrides: Partial<ReturnType<typeof useVoteSocketModule.useVoteSocket>> = {}) {
  return {
    statut: "ouvert" as const,
    participation: null,
    resultats: null,
    erreur: null,
    voteEnregistre: false,
    voter: vi.fn(),
    ...overrides,
  };
}

describe("VotePage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
    vi.mocked(useVoteHooks.useCloturerVoteSession).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useVoteHooks.useCloturerVoteSession>);
    vi.mocked(useVoteHooks.useHistoriqueVote).mockReturnValue({
      data: page([]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useHistoriqueVote>);
    vi.mocked(useVoteHooks.useResultatsVote).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useResultatsVote>);
  });

  it("affiche l'état vide quand aucune session n'est ouverte", () => {
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(socketDefaut());

    renderWithProviders(<VotePage />);
    expect(screen.getByText("vide.titre")).toBeInTheDocument();
  });

  it("un membre normal ne voit ni le bouton de création ni la clôture", () => {
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([sessionOuverte]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: sessionOuverte,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(socketDefaut());

    renderWithProviders(<VotePage />);
    expect(screen.queryByText("page.creer_session")).not.toBeInTheDocument();
    expect(screen.queryByText("session.cloturer")).not.toBeInTheDocument();
    expect(screen.getByText("Élection du Bureau")).toBeInTheDocument();
  });

  it("un Bureau Admin voit le bouton de clôture et peut voter comme n'importe quel membre", () => {
    useAuthStore.setState({ user: bureauAdmin });
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([sessionOuverte]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: sessionOuverte,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(socketDefaut());

    renderWithProviders(<VotePage />);
    expect(screen.getByText("page.creer_session", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("session.cloturer")).toBeInTheDocument();
  });

  it("affiche la confirmation de vote une fois le bulletin envoyé (vote_enregistre)", () => {
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([sessionOuverte]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: sessionOuverte,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(
      socketDefaut({ voteEnregistre: true }),
    );

    renderWithProviders(<VotePage />);
    expect(screen.getByText("bulletin.vote_enregistre")).toBeInTheDocument();
    expect(screen.queryByText("bulletin.confirmer")).not.toBeInTheDocument();
  });

  it("affiche le podium quand la clôture diffuse resultats_disponibles", () => {
    const resultats: Resultats = {
      session_id: "s1",
      statut: "cloturee",
      total_participants: 5,
      total_eligibles: 10,
      taux_participation: 50,
      quorum_requis: null,
      quorum_atteint: true,
      resultats: [{ option_id: "o1", label: "Candidat A", nombre_voix: 5, pct: 100 }],
    };
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([sessionOuverte]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: sessionOuverte,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(socketDefaut({ resultats }));

    renderWithProviders(<VotePage />);
    expect(screen.getByText("resultats.titre")).toBeInTheDocument();
    expect(screen.getByText("Candidat A")).toBeInTheDocument();
  });

  it("ouvre les résultats d'une session passée au clic dans l'historique", () => {
    const sessionPassee = { ...sessionOuverte, id: "s0", statut: "cloturee" as const };
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(socketDefaut());
    vi.mocked(useVoteHooks.useHistoriqueVote).mockReturnValue({
      data: page([sessionPassee]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useHistoriqueVote>);
    vi.mocked(useVoteHooks.useResultatsVote).mockReturnValue({
      data: {
        session_id: "s0",
        statut: "cloturee",
        total_participants: 2,
        total_eligibles: 10,
        taux_participation: 20,
        quorum_requis: null,
        quorum_atteint: true,
        resultats: [{ option_id: "o1", label: "Candidat A", nombre_voix: 2, pct: 100 }],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useResultatsVote>);

    renderWithProviders(<VotePage />);
    fireEvent.click(screen.getByText("onglets.historique"));
    fireEvent.click(screen.getByText("Élection du Bureau"));
    expect(screen.getByText("Candidat A")).toBeInTheDocument();
  });

  it("affiche un état de connexion (et jamais un bouton bloqué) tant que le socket n'est pas ouvert", () => {
    // Régression : le bouton de vote restait affiché en permanence sur "envoi en cours" quand
    // la connexion WebSocket n'atteignait jamais l'état "ouvert" (bug de production — voir
    // useVoteSocket.test.ts). Le bulletin ne doit apparaître qu'une fois réellement connecté.
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([sessionOuverte]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: sessionOuverte,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(
      socketDefaut({ statut: "connexion" }),
    );

    renderWithProviders(<VotePage />);
    expect(screen.getByText("bulletin.connexion_en_cours")).toBeInTheDocument();
    expect(screen.queryByText("bulletin.confirmer")).not.toBeInTheDocument();
    expect(screen.queryByText("bulletin.envoi_en_cours")).not.toBeInTheDocument();
  });

  it("affiche un message d'indisponibilité si la connexion échoue", () => {
    vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue({
      data: page([sessionOuverte]),
      isLoading: false,
    } as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>);
    vi.mocked(useVoteHooks.useVoteSession).mockReturnValue({
      data: sessionOuverte,
    } as unknown as ReturnType<typeof useVoteHooks.useVoteSession>);
    vi.mocked(useVoteSocketModule.useVoteSocket).mockReturnValue(
      socketDefaut({ statut: "erreur" }),
    );

    renderWithProviders(<VotePage />);
    expect(screen.getByText("bulletin.connexion_indisponible")).toBeInTheDocument();
  });
});
