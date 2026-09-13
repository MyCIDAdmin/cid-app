import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Sujet } from "../../types/communaute";
import ForumPage from "./ForumPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useSujets: vi.fn(),
    useCreerSujet: vi.fn(),
  };
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

const auteurA = { id: "m1", prenom: "Hamza", nom: "Meddeb", photo: null };

function sujet(overrides: Partial<Sujet> = {}): Sujet {
  return {
    id: "s1",
    auteur: auteurA,
    categorie: "general",
    titre: "Bienvenue sur le forum",
    contenu: "Premier sujet du forum.",
    est_epingle: false,
    est_verrouille: false,
    est_masque: false,
    motif_masquage: "",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    nombre_reponses: 0,
    reponses: [],
    est_auteur: false,
    ...overrides,
  };
}

function mutationMock() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useCommunauteHooks.useCreerSujet
  >;
}

describe("ForumPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerSujet).mockReturnValue(mutationMock());
  });

  it("affiche la liste des sujets avec les sujets épinglés signalés", () => {
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([
        sujet({ titre: "Sujet normal" }),
        sujet({ id: "s2", titre: "Sujet épinglé", est_epingle: true }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />, { route: "/forum", path: "/forum" });

    expect(screen.getByText("Sujet normal")).toBeInTheDocument();
    expect(screen.getByText("Sujet épinglé")).toBeInTheDocument();
  });

  it("affiche un message si aucun sujet", () => {
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    expect(screen.getByText("forum.aucun_sujet")).toBeInTheDocument();
  });

  it("ouvre le formulaire et crée un sujet", () => {
    const creer = mutationMock();
    vi.mocked(useCommunauteHooks.useCreerSujet).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    fireEvent.click(screen.getByText("forum.nouveau_sujet"));
    fireEvent.change(screen.getByPlaceholderText("forum.titre_placeholder"), {
      target: { value: "Un nouveau sujet" },
    });
    fireEvent.change(screen.getByPlaceholderText("forum.contenu_placeholder"), {
      target: { value: "Le contenu du sujet." },
    });
    fireEvent.click(screen.getByText("forum.publier_sujet"));

    expect(creer.mutate).toHaveBeenCalledWith(
      { categorie: "general", titre: "Un nouveau sujet", contenu: "Le contenu du sujet." },
      expect.anything(),
    );
  });

  it("filtre par catégorie", () => {
    const useSujetsMock = vi.mocked(useCommunauteHooks.useSujets);
    useSujetsMock.mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    fireEvent.click(screen.getByText("categorie.emploi"));

    expect(useSujetsMock).toHaveBeenLastCalledWith({ categorie: "emploi" });
  });
});
