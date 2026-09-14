import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Quiz } from "../../types/communaute";
import QuizPage from "./QuizPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useQuizListe: vi.fn() };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: "q1",
    titre: "Histoire du CA",
    description: "Que savez-vous du Club Africain ?",
    est_actif: true,
    created_at: "2026-01-01T10:00:00Z",
    questions: [],
    nombre_questions: 5,
    ma_participation: null,
    ...overrides,
  };
}

describe("QuizPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
  });

  it("affiche la liste des quiz avec leur badge actif/inactif", () => {
    vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
      data: page([quiz(), quiz({ id: "q2", titre: "Saison 2025-2026", est_actif: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);

    renderWithProviders(<QuizPage />);

    expect(screen.getByText("Histoire du CA")).toBeInTheDocument();
    expect(screen.getByText("quiz.actif_badge")).toBeInTheDocument();
    expect(screen.getByText("quiz.inactif_badge")).toBeInTheDocument();
  });

  it("affiche un message si aucun quiz", () => {
    vi.mocked(useCommunauteHooks.useQuizListe).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useQuizListe>);

    renderWithProviders(<QuizPage />);

    expect(screen.getByText("quiz.aucun_quiz")).toBeInTheDocument();
  });
});
