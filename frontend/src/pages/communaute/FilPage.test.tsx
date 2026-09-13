import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Publication } from "../../types/communaute";
import FilPage from "./FilPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    usePublications: vi.fn(),
    useCreerPublication: vi.fn(),
    useSupprimerPublication: vi.fn(),
    useLikerPublication: vi.fn(),
    usePartagerPublication: vi.fn(),
    useMasquerPublication: vi.fn(),
    useCommenterPublication: vi.fn(),
    useSupprimerCommentaire: vi.fn(),
    useMasquerCommentaire: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const bureauAdmin = { ...membre, id: "u2", role: "bureau_admin" as const };

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const auteurA = { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null };

function publication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: "p1",
    auteur: auteurA,
    contenu: "Allez le CA !",
    image: null,
    hashtags: [],
    est_masquee: false,
    motif_masquage: "",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    nombre_likes: 0,
    nombre_partages: 0,
    nombre_commentaires: 0,
    jaime: false,
    jai_partage: false,
    est_auteur: false,
    commentaires: [],
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

describe("FilPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useLikerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useLikerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.usePartagerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.usePartagerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useCommenterPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCommenterPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerCommentaire).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerCommentaire>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerCommentaire).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerCommentaire>>(),
    );
  });

  it("affiche les publications du fil", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ contenu: "Belle victoire hier soir" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("Belle victoire hier soir")).toBeInTheDocument();
    expect(screen.getByText("Sana Werfelli")).toBeInTheDocument();
  });

  it("affiche un message si le fil est vide", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("fil.aucune_publication")).toBeInTheDocument();
  });

  it("affiche les hashtags d'une publication", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ hashtags: ["ca1920", "berlin"] })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("#ca1920")).toBeInTheDocument();
    expect(screen.getByText("#berlin")).toBeInTheDocument();
  });

  it("appelle liker au clic sur le bouton like", () => {
    const liker = mutationMock<ReturnType<typeof useCommunauteHooks.useLikerPublication>>();
    vi.mocked(useCommunauteHooks.useLikerPublication).mockReturnValue(liker);
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByText("♥ 0"));
    expect(liker.mutate).toHaveBeenCalledWith("p1");
  });

  it("un membre normal ne voit pas le bouton masquer sur le contenu d'autrui", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ est_auteur: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.queryByText("fil.masquer")).not.toBeInTheDocument();
    expect(screen.queryByText("fil.supprimer")).not.toBeInTheDocument();
  });

  it("un bureau admin voit le bouton masquer sur le contenu d'autrui", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ est_auteur: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("fil.masquer")).toBeInTheDocument();
  });

  it("l'auteur voit le bouton supprimer sur sa propre publication", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ est_auteur: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("fil.supprimer")).toBeInTheDocument();
  });

  it("soumet une nouvelle publication", () => {
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerPublication>>();
    vi.mocked(useCommunauteHooks.useCreerPublication).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.change(screen.getByPlaceholderText("fil.placeholder_publication"), {
      target: { value: "Nouvelle actu" },
    });
    fireEvent.click(screen.getByText("fil.publier"));

    expect(creer.mutate).toHaveBeenCalledWith(
      { contenu: "Nouvelle actu", image: undefined },
      expect.anything(),
    );
  });
});
