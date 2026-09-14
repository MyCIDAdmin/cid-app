import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { ParticipationQuiz, Quiz, ReponseQuiz } from "../../types/communaute";
import QuizDetailPage from "./QuizDetailPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useQuiz: vi.fn(),
    useDemarrerQuiz: vi.fn(),
    useRepondreQuiz: vi.fn(),
    useClassementQuiz: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function participation(overrides: Partial<ParticipationQuiz> = {}): ParticipationQuiz {
  return {
    id: "part1",
    quiz: "q1",
    membre: { id: "u1", prenom: "Sana", nom: "Werfelli", photo: null },
    score: 0,
    demarree_le: "2026-01-01T10:00:00Z",
    terminee_le: null,
    temps_total_secondes: null,
    ...overrides,
  };
}

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: "q1",
    titre: "Histoire du CA",
    description: "",
    est_actif: true,
    created_at: "2026-01-01T10:00:00Z",
    questions: [
      {
        id: "que1",
        quiz: "q1",
        texte: "En quelle année le CA a-t-il été fondé ?",
        ordre: 1,
        points: 10,
        choix: [
          { id: "c1", question: "que1", texte: "1920" },
          { id: "c2", question: "que1", texte: "1905" },
        ],
      },
    ],
    nombre_questions: 1,
    ma_participation: null,
    ...overrides,
  };
}

function renderDetail() {
  return renderWithProviders(<QuizDetailPage />, { route: "/quiz/q1", path: "/quiz/:id" });
}

describe("QuizDetailPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useDemarrerQuiz).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useDemarrerQuiz>>(),
    );
    vi.mocked(useCommunauteHooks.useRepondreQuiz).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useRepondreQuiz>>(),
    );
    vi.mocked(useCommunauteHooks.useClassementQuiz).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementQuiz>);
  });

  it("propose de démarrer le quiz quand aucune participation n'existe", () => {
    vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
      data: quiz(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);
    const demarrer = mutationMock<ReturnType<typeof useCommunauteHooks.useDemarrerQuiz>>();
    vi.mocked(useCommunauteHooks.useDemarrerQuiz).mockReturnValue(demarrer);

    renderDetail();

    fireEvent.click(screen.getByText("quiz.demarrer"));

    expect(demarrer.mutate).toHaveBeenCalledWith("q1");
  });

  it("affiche la question courante une fois la participation démarrée", () => {
    vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
      data: quiz({ ma_participation: participation() }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);

    renderDetail();

    expect(screen.getByText("En quelle année le CA a-t-il été fondé ?")).toBeInTheDocument();
    expect(screen.getByText("1920")).toBeInTheDocument();
  });

  it("valide une réponse et affiche le retour de correction (jamais déduit côté client)", () => {
    vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
      data: quiz({ ma_participation: participation() }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);

    const reponseServeur: ReponseQuiz = {
      id: "rep1",
      participation: "part1",
      question: "que1",
      choix: "c1",
      est_correct: true,
      points_obtenus: 10,
      created_at: "2026-01-01T10:05:00Z",
    };
    const repondre = {
      mutate: vi.fn((_vars, options) => options?.onSuccess?.(reponseServeur)),
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRepondreQuiz>;
    vi.mocked(useCommunauteHooks.useRepondreQuiz).mockReturnValue(repondre);

    renderDetail();

    fireEvent.click(screen.getByText("1920"));
    fireEvent.click(screen.getByText("quiz.valider_reponse"));

    expect(repondre.mutate).toHaveBeenCalledWith(
      { quizId: "q1", question: "que1", choix: "c1" },
      expect.anything(),
    );
    expect(screen.getByText(/quiz.bonne_reponse/)).toBeInTheDocument();
  });

  it("affiche le score final et le classement quand le quiz est terminé", () => {
    vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
      data: quiz({ ma_participation: participation({ terminee_le: "2026-01-01T10:10:00Z", score: 10 }) }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);
    vi.mocked(useCommunauteHooks.useClassementQuiz).mockReturnValue({
      data: { classement: [participation({ terminee_le: "2026-01-01T10:10:00Z", score: 10 })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementQuiz>);

    renderDetail();

    expect(screen.getByText("quiz.quiz_termine")).toBeInTheDocument();
    expect(screen.getByText("Sana Werfelli", { exact: false })).toBeInTheDocument();
  });
});
