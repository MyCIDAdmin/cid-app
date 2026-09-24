import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useLiveMatchSocketHook from "../../hooks/useLiveMatchSocket";
import { useAuthStore } from "../../store/authStore";
import type { Match } from "../../types/communaute";
import LiveMatchDetailPage from "./LiveMatchDetailPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useMatch: vi.fn(),
    useMatchCommentaires: vi.fn(),
    useModifierMatch: vi.fn(),
    useMatchEvenements: vi.fn(),
    useCreerMatchEvenement: vi.fn(),
  };
});

vi.mock("../../hooks/useLiveMatchSocket", () => ({ useLiveMatchSocket: vi.fn() }));

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

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: "m1",
    adversaire: "ES Tunis",
    competition: "Ligue 1",
    lieu: "Stade Olympique de Radès",
    date_heure: "2026-03-01T18:00:00Z",
    statut: "en_cours",
    score_ca: 1,
    score_adversaire: 0,
    minute_chrono: 42,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    reactions: { coeur: 2, feu: 1, etoile: 0, surprise: 0 },
    ...overrides,
  };
}

function renderDetail() {
  return renderWithProviders(<LiveMatchDetailPage />, { route: "/live/m1", path: "/live/:id" });
}

describe("LiveMatchDetailPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useMatch).mockReturnValue({
      data: match(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatch>);
    vi.mocked(useCommunauteHooks.useMatchCommentaires).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchCommentaires>);
    vi.mocked(useCommunauteHooks.useModifierMatch).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierMatch>>(),
    );
    vi.mocked(useCommunauteHooks.useMatchEvenements).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchEvenements>);
    vi.mocked(useCommunauteHooks.useCreerMatchEvenement).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerMatchEvenement>>(),
    );
    vi.mocked(useLiveMatchSocketHook.useLiveMatchSocket).mockReturnValue({
      statut: "ouvert",
      commentaires: [],
      reactions: null,
      connectes: 12,
      miseAJourMatch: null,
      evenements: [],
      erreur: null,
      envoyerCommentaire: vi.fn(),
      envoyerReaction: vi.fn(),
    });
  });

  it("affiche le score et le nombre de connectés", () => {
    renderDetail();

    expect(screen.getByText("1 — 0")).toBeInTheDocument();
    expect(screen.getByText("live.connectes")).toBeInTheDocument();
  });

  it("privilégie la mise à jour WebSocket sur le score REST", () => {
    vi.mocked(useLiveMatchSocketHook.useLiveMatchSocket).mockReturnValue({
      statut: "ouvert",
      commentaires: [],
      reactions: null,
      connectes: 12,
      miseAJourMatch: {
        type: "match",
        id: "m1",
        statut: "en_cours",
        score_ca: 3,
        score_adversaire: 1,
        minute_chrono: 77,
      },
      evenements: [],
      erreur: null,
      envoyerCommentaire: vi.fn(),
      envoyerReaction: vi.fn(),
    });

    renderDetail();

    expect(screen.getByText("3 — 1")).toBeInTheDocument();
  });

  it("envoie un commentaire via le WebSocket", () => {
    const envoyerCommentaire = vi.fn();
    vi.mocked(useLiveMatchSocketHook.useLiveMatchSocket).mockReturnValue({
      statut: "ouvert",
      commentaires: [],
      reactions: null,
      connectes: 0,
      miseAJourMatch: null,
      evenements: [],
      erreur: null,
      envoyerCommentaire,
      envoyerReaction: vi.fn(),
    });

    renderDetail();

    fireEvent.change(screen.getByPlaceholderText("live.placeholder_commentaire"), {
      target: { value: "Allez CA !" },
    });
    fireEvent.click(screen.getByText("live.envoyer"));

    expect(envoyerCommentaire).toHaveBeenCalledWith("Allez CA !");
  });

  it("envoie une réaction via le WebSocket", () => {
    const envoyerReaction = vi.fn();
    vi.mocked(useLiveMatchSocketHook.useLiveMatchSocket).mockReturnValue({
      statut: "ouvert",
      commentaires: [],
      reactions: null,
      connectes: 0,
      miseAJourMatch: null,
      evenements: [],
      erreur: null,
      envoyerCommentaire: vi.fn(),
      envoyerReaction,
    });

    renderDetail();

    fireEvent.click(screen.getByText("❤️"));

    expect(envoyerReaction).toHaveBeenCalledWith("coeur");
  });

  it("masque le pilotage du match à un membre standard", () => {
    renderDetail();
    expect(screen.queryByText("live.modifier_match")).not.toBeInTheDocument();
  });

  it("permet à un Bureau Admin+ de mettre à jour le score", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: admin, isAuthenticated: true });
    const modifier = mutationMock<ReturnType<typeof useCommunauteHooks.useModifierMatch>>();
    vi.mocked(useCommunauteHooks.useModifierMatch).mockReturnValue(modifier);

    renderDetail();

    fireEvent.click(screen.getByText("live.modifier_match"));
    fireEvent.click(screen.getByText("live.enregistrer"));

    expect(modifier.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1" }),
      expect.anything(),
    );
  });

  // --- Fan-Club — journal d'événements du Live-Ticker (2026-09-24) ---

  it("affiche l'historique REST des événements fusionné au flux WebSocket sans doublon", () => {
    vi.mocked(useCommunauteHooks.useMatchEvenements).mockReturnValue({
      data: page([
        {
          id: "e1",
          match: "m1",
          type_evenement: "but",
          minute: 12,
          equipe: "ca",
          joueur: "Joueur A",
          description: "",
          created_by_nom: "Admin",
          created_at: "2026-03-01T18:12:00Z",
        },
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMatchEvenements>);
    vi.mocked(useLiveMatchSocketHook.useLiveMatchSocket).mockReturnValue({
      statut: "ouvert",
      commentaires: [],
      reactions: null,
      connectes: 0,
      miseAJourMatch: null,
      evenements: [
        // Même id que l'historique REST — ne doit pas être compté deux fois (même principe
        // de déduplication que tousLesCommentaires).
        {
          type: "match_evenement",
          id: "e1",
          match: "m1",
          type_evenement: "but",
          minute: 12,
          equipe: "ca",
          joueur: "Joueur A",
          description: "",
          created_by_nom: "Admin",
          created_at: "2026-03-01T18:12:00Z",
        },
        {
          type: "match_evenement",
          id: "e2",
          match: "m1",
          type_evenement: "carton_jaune",
          minute: 30,
          equipe: "adversaire",
          joueur: "",
          description: "",
          created_by_nom: "Admin",
          created_at: "2026-03-01T18:30:00Z",
        },
      ],
      erreur: null,
      envoyerCommentaire: vi.fn(),
      envoyerReaction: vi.fn(),
    });

    renderDetail();

    expect(screen.getAllByText("live.evenement_but")).toHaveLength(1);
    expect(screen.getByText("live.evenement_carton_jaune")).toBeInTheDocument();
    expect(screen.getByText(/Joueur A/)).toBeInTheDocument();
  });

  it("affiche le message d'absence d'événement quand la liste est vide", () => {
    renderDetail();
    expect(screen.getByText("live.evenements_aucun")).toBeInTheDocument();
  });

  it("masque l'ajout d'événement à un membre standard", () => {
    renderDetail();
    expect(screen.queryByText("live.ajouter_evenement")).not.toBeInTheDocument();
  });

  it("permet à un Bureau Admin+ d'ajouter un événement au Live-Ticker", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: admin, isAuthenticated: true });
    const creerEvenement = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerMatchEvenement>>();
    vi.mocked(useCommunauteHooks.useCreerMatchEvenement).mockReturnValue(creerEvenement);

    renderDetail();

    fireEvent.click(screen.getByText("live.ajouter_evenement"));
    fireEvent.change(screen.getByPlaceholderText("live.evenement_joueur_placeholder"), {
      target: { value: "Joueur B" },
    });
    // Seul le champ "minute" du formulaire d'événement est un <input type="number"> tant que
    // le formulaire de pilotage du score (autre bloc, non ouvert ici) ne l'est pas.
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "60" } });
    fireEvent.click(screen.getByText("live.evenement_ajouter"));

    expect(creerEvenement.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ match: "m1", minute: 60, joueur: "Joueur B" }),
      expect.anything(),
    );
  });
});
