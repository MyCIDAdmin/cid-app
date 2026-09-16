import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import type { ArticleCatalogue } from "../../types/cotisation";
import ArticlesCatalogueCotisationPage from "./ArticlesCatalogueCotisationPage";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useArticlesCatalogue: vi.fn(),
    useCreerArticleCatalogue: vi.fn(),
    useModifierArticleCatalogue: vi.fn(),
  };
});

function articleCatalogue(overrides: Partial<ArticleCatalogue> = {}): ArticleCatalogue {
  return {
    id: "art-1",
    libelle: "T-shirt du club",
    montant: "20.00",
    actif: true,
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
    ...overrides,
  };
}

describe("ArticlesCatalogueCotisationPage", () => {
  beforeEach(() => {
    vi.mocked(useCotisationsHooks.useCreerArticleCatalogue).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerArticleCatalogue>);
    vi.mocked(useCotisationsHooks.useModifierArticleCatalogue).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useModifierArticleCatalogue>);
  });

  it("affiche un message quand aucun article n'est créé", () => {
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<ArticlesCatalogueCotisationPage />);

    expect(screen.getByText("catalogue_articles.aucun")).toBeInTheDocument();
  });

  it("affiche le libellé, le montant et le statut d'un article", () => {
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [articleCatalogue()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<ArticlesCatalogueCotisationPage />);

    expect(screen.getByTestId("article-catalogue-libelle-art-1")).toHaveValue("T-shirt du club");
    expect(screen.getByTestId("article-catalogue-montant-art-1")).toHaveValue(20);
    expect(screen.getByText("catalogue_articles.statut_actif")).toBeInTheDocument();
  });

  it("crée un nouvel article via le formulaire d'ajout", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useCreerArticleCatalogue).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerArticleCatalogue>);
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<ArticlesCatalogueCotisationPage />);

    fireEvent.change(screen.getByLabelText("catalogue_articles.champ_libelle"), {
      target: { value: "Écusson brodé" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_articles.champ_montant"), {
      target: { value: "8.50" },
    });
    fireEvent.click(screen.getByText("catalogue_articles.ajouter"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ libelle: "Écusson brodé", montant: "8.50" });
  });

  it("modifie le libellé/montant d'un article existant", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useModifierArticleCatalogue).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useModifierArticleCatalogue>);
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [articleCatalogue()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<ArticlesCatalogueCotisationPage />);

    fireEvent.change(screen.getByTestId("article-catalogue-montant-art-1"), {
      target: { value: "25.00" },
    });
    fireEvent.click(screen.getByText("catalogue_articles.enregistrer"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      id: "art-1",
      payload: { libelle: "T-shirt du club", montant: "25.00" },
    });
  });

  it("le bouton enregistrer reste désactivé tant que rien n'a changé", () => {
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [articleCatalogue()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<ArticlesCatalogueCotisationPage />);

    expect(screen.getByText("catalogue_articles.enregistrer")).toBeDisabled();
  });

  it("désactive un article actif", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useModifierArticleCatalogue).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useModifierArticleCatalogue>);
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [articleCatalogue()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<ArticlesCatalogueCotisationPage />);
    fireEvent.click(screen.getByText("catalogue_articles.desactiver"));

    expect(mutate).toHaveBeenCalledWith({ id: "art-1", payload: { actif: false } });
  });

  it("réactive un article désactivé", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useModifierArticleCatalogue).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useModifierArticleCatalogue>);
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [articleCatalogue({ actif: false })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<ArticlesCatalogueCotisationPage />);

    expect(screen.getByText("catalogue_articles.statut_inactif")).toBeInTheDocument();
    fireEvent.click(screen.getByText("catalogue_articles.activer"));

    expect(mutate).toHaveBeenCalledWith({ id: "art-1", payload: { actif: true } });
  });
});
