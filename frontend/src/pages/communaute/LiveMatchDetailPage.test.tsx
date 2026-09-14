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
  return { ...actual, useMatch: vi.fn(), useMatchCommentaires: vi.fn(), useModifierMatch: vi.fn() };
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
    vi.mocked(useLiveMatchSocketHook.useLiveMatchSocket).mockReturnValue({
      statut: "ouvert",
      commentaires: [],
      reactions: null,
      connectes: 12,
      miseAJourMatch: null,
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
});
