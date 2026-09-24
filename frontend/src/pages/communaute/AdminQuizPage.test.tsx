import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useRbacHooks from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import type { Quiz } from "../../types/communaute";
import AdminQuizPage from "./AdminQuizPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useQuizListe: vi.fn(),
    useQuiz: vi.fn(),
    useCreerQuiz: vi.fn(),
    useModifierQuiz: vi.fn(),
    useSupprimerQuiz: vi.fn(),
    useCreerQuestionQuiz: vi.fn(),
    useSupprimerQuestionQuiz: vi.fn(),
    useCreerChoixQuestion: vi.fn(),
    useSupprimerChoixQuestion: vi.fn(),
  };
});

// page_quiz en lecture_ecriture par défaut (task #216) — ces tests portent sur le comportement
// habituel de la page, pas sur le gating lecture seule lui-même (describe dédié plus bas). Même
// convention que AdminBoutiquePage.test.tsx : mock direct de usePageAccess.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
});

const bureauAdmin = {
  id: "u1",
  email: "admin@example.com",
  role: "bureau_admin" as const,
  langue_preferee: "fr" as const,
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: "q1",
    titre: "Histoire du CA",
    description: "",
    est_actif: true,
    created_at: "2026-01-01T10:00:00Z",
    questions: [],
    nombre_questions: 0,
    ma_participation: null,
    ...overrides,
  };
}

describe("AdminQuizPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerQuiz).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerQuiz>>(),
    );
    vi.mocked(useCommunauteHooks.useModifierQuiz).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierQuiz>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerQuiz).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerQuiz>>(),
    );
    vi.mocked(useCommunauteHooks.useCreerQuestionQuiz).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerQuestionQuiz>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerQuestionQuiz).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerQuestionQuiz>>(),
    );
    vi.mocked(useCommunauteHooks.useCreerChoixQuestion).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerChoixQuestion>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerChoixQuestion).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerChoixQuestion>>(),
    );
    vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
  });

  it("affiche la liste des quiz existants", () => {
    vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
      data: page([quiz()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);

    renderWithProviders(<AdminQuizPage />);

    expect(screen.getByText("Histoire du CA")).toBeInTheDocument();
  });

  it("crée un nouveau quiz (corrige le bug 'impossible de créer un quiz')", () => {
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerQuiz>>();
    vi.mocked(useCommunauteHooks.useCreerQuiz).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);

    renderWithProviders(<AdminQuizPage />);

    fireEvent.change(screen.getByPlaceholderText("admin_quiz.titre_placeholder"), {
      target: { value: "Anecdotes CA" },
    });
    fireEvent.click(screen.getByText("admin_quiz.creer"));

    expect(creer.mutate).toHaveBeenCalledWith(
      { titre: "Anecdotes CA", description: "" },
      expect.anything(),
    );
  });

  it("sélectionne un quiz et affiche ses questions/choix (création en 3 étapes, endpoints à plat)", () => {
    vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
      data: page([quiz()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);
    vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
      data: quiz({
        questions: [
          {
            id: "que1",
            quiz: "q1",
            texte: "En quelle année le CA a-t-il été fondé ?",
            ordre: 1,
            points: 10,
            choix: [{ id: "c1", question: "que1", texte: "1920", est_correct: true }],
          },
        ],
        nombre_questions: 1,
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);

    renderWithProviders(<AdminQuizPage />);

    fireEvent.click(screen.getByText("Histoire du CA"));

    expect(
      screen.getByText("En quelle année le CA a-t-il été fondé ?", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("1920", { exact: false })).toBeInTheDocument();
  });

  it("ajoute une question à un quiz sélectionné", () => {
    vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
      data: page([quiz()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);
    vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
      data: quiz(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);
    const creerQuestion = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerQuestionQuiz>>();
    vi.mocked(useCommunauteHooks.useCreerQuestionQuiz).mockReturnValue(creerQuestion);

    renderWithProviders(<AdminQuizPage />);

    fireEvent.click(screen.getByText("Histoire du CA"));
    fireEvent.change(screen.getByPlaceholderText("admin_quiz.question_placeholder"), {
      target: { value: "Combien de titres de champion ?" },
    });
    fireEvent.click(screen.getByText("admin_quiz.ajouter_question"));

    expect(creerQuestion.mutate).toHaveBeenCalledWith(
      { quiz: "q1", texte: "Combien de titres de champion ?", points: 10 },
      expect.anything(),
    );
  });

  it("active/désactive un quiz", () => {
    const modifier = mutationMock<ReturnType<typeof useCommunauteHooks.useModifierQuiz>>();
    vi.mocked(useCommunauteHooks.useModifierQuiz).mockReturnValue(modifier);
    vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
      data: page([quiz({ est_actif: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);

    renderWithProviders(<AdminQuizPage />);

    fireEvent.click(screen.getByText("admin_quiz.desactiver"));

    expect(modifier.mutate).toHaveBeenCalledWith({ id: "q1", payload: { est_actif: false } });
  });

  describe("lecture seule (task #216 — page_quiz en 'lecture' uniquement)", () => {
    beforeEach(() => {
      vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
        accessible: true,
        modifiable: false,
        isLoading: false,
      });
    });

    it("affiche la bannière lecture seule et désactive les contrôles d'écriture", () => {
      const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerQuiz>>();
      vi.mocked(useCommunauteHooks.useCreerQuiz).mockReturnValue(creer);
      const modifier = mutationMock<ReturnType<typeof useCommunauteHooks.useModifierQuiz>>();
      vi.mocked(useCommunauteHooks.useModifierQuiz).mockReturnValue(modifier);
      vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
        data: page([quiz()]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);

      renderWithProviders(<AdminQuizPage />);

      expect(screen.getByText("acces.lecture_seule_banniere")).toBeInTheDocument();
      expect(screen.getByText("admin_quiz.creer")).toBeDisabled();

      fireEvent.click(screen.getByText("admin_quiz.desactiver"));
      expect(modifier.mutate).not.toHaveBeenCalled();

      fireEvent.change(screen.getByPlaceholderText("admin_quiz.titre_placeholder"), {
        target: { value: "Anecdotes CA" },
      });
      fireEvent.click(screen.getByText("admin_quiz.creer"));
      expect(creer.mutate).not.toHaveBeenCalled();
    });

    it("garde la lecture pleinement fonctionnelle (liste + sélection d'un quiz)", () => {
      vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
        data: page([quiz()]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);
      vi.mocked(useCommunauteHooks.useQuiz).mockReturnValue({
        data: quiz(),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useQuiz>);

      renderWithProviders(<AdminQuizPage />);
      fireEvent.click(screen.getByText("Histoire du CA"));

      expect(screen.getByText("admin_quiz.aucune_question")).toBeInTheDocument();
    });
  });
});
