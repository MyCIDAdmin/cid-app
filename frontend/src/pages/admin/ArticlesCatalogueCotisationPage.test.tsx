import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useRbacHooks from "../../hooks/useRbac";
import type { ArticleCatalogue } from "../../types/cotisation";
import ArticlesCatalogueCotisationPage from "./ArticlesCatalogueCotisationPage";

// task #216 : usePageAccess mocké partout (accès complet par défaut) — describe dédié plus bas
// pour le mode lecture seule.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
});

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
    type_fixe: null,
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
    ...overrides,
  };
}

describe("ArticlesCatalogueCotisationPage", () => {
  beforeEach(() => {
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
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

  // Ajouté le 2026-09-17 (retour utilisateur : "die bestehende [Cotisation annuelle/Frais
  // d'adhésion] müssen auch verwaltbar sein") — voir ArticleCatalogue.type_fixe.
  describe("lignes techniques type_fixe (cotisation/adhésion)", () => {
    function articleFixe(overrides: Partial<ArticleCatalogue> = {}): ArticleCatalogue {
      return articleCatalogue({
        id: "art-fixe-cotisation",
        libelle: "Cotisation annuelle",
        montant: "45.00",
        type_fixe: "cotisation",
        ...overrides,
      });
    }

    it("affiche un libellé fixe traduit sans champ libellé éditable", () => {
      vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
        data: { next: null, previous: null, results: [articleFixe()] },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

      renderWithProviders(<ArticlesCatalogueCotisationPage />);

      expect(screen.getByTestId("article-catalogue-libelle-fixe-art-fixe-cotisation")).toHaveTextContent(
        "catalogue_articles.type_fixe_cotisation",
      );
      expect(screen.queryByTestId("article-catalogue-libelle-art-fixe-cotisation")).not.toBeInTheDocument();
      expect(screen.getByText("catalogue_articles.badge_type_fixe")).toBeInTheDocument();
    });

    it("garde le montant et la bascule actif/inactif éditables pour une ligne type_fixe", () => {
      const mutate = vi.fn();
      vi.mocked(useCotisationsHooks.useModifierArticleCatalogue).mockReturnValue({
        mutate,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof useCotisationsHooks.useModifierArticleCatalogue>);
      vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
        data: { next: null, previous: null, results: [articleFixe()] },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

      renderWithProviders(<ArticlesCatalogueCotisationPage />);

      fireEvent.change(screen.getByTestId("article-catalogue-montant-art-fixe-cotisation"), {
        target: { value: "50.00" },
      });
      fireEvent.click(screen.getByText("catalogue_articles.enregistrer"));

      // Seul `montant` est transmis — jamais `libelle`, ignoré côté serveur pour ces lignes (voir
      // ArticleCatalogueSerializer.update).
      expect(mutate).toHaveBeenCalledWith({
        id: "art-fixe-cotisation",
        payload: { montant: "50.00" },
      });

      fireEvent.click(screen.getByText("catalogue_articles.desactiver"));
      expect(mutate).toHaveBeenCalledWith({
        id: "art-fixe-cotisation",
        payload: { actif: false },
      });
    });

    it("épingle les 2 lignes type_fixe en tête de tableau, avant les articles personnalisés", () => {
      vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
        data: {
          next: null,
          previous: null,
          results: [
            articleCatalogue({ id: "art-custom", libelle: "T-shirt du club" }),
            articleFixe({ id: "art-fixe-adhesion", libelle: "Frais d'adhésion", type_fixe: "adhesion" }),
            articleFixe(),
          ],
        },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

      renderWithProviders(<ArticlesCatalogueCotisationPage />);

      // Le libellé d'un article personnalisé est un <input> (valeur, pas texte enfant) — on
      // vérifie donc la présence de son testid dans la ligne plutôt que son contenu textuel.
      const lignes = screen.getAllByRole("row").slice(1); // exclut l'en-tête
      expect(lignes[0]).toHaveTextContent("catalogue_articles.type_fixe_adhesion");
      expect(lignes[1]).toHaveTextContent("catalogue_articles.type_fixe_cotisation");
      expect(
        lignes[2].querySelector('[data-testid="article-catalogue-libelle-art-custom"]'),
      ).toHaveValue("T-shirt du club");
    });
  });

  // --- Lecture seule (task #216, RBAC page_articles_cotisation) ---
  describe("mode lecture seule", () => {
    beforeEach(() => {
      vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
        accessible: true,
        modifiable: false,
        isLoading: false,
      });
      vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
        data: { next: null, previous: null, results: [articleCatalogue()] },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
    });

    it("affiche la bannière de lecture seule et désactive la création/modification/bascule", () => {
      renderWithProviders(<ArticlesCatalogueCotisationPage />);

      expect(screen.getByText("acces.lecture_seule_banniere")).toBeInTheDocument();
      expect(screen.getByLabelText("catalogue_articles.champ_libelle")).toBeDisabled();
      expect(screen.getByText("catalogue_articles.ajouter")).toBeDisabled();
      expect(screen.getByTestId("article-catalogue-libelle-art-1")).toBeDisabled();
      expect(screen.getByTestId("article-catalogue-montant-art-1")).toBeDisabled();
      expect(screen.getByText("catalogue_articles.enregistrer")).toBeDisabled();
      expect(screen.getByText("catalogue_articles.desactiver")).toBeDisabled();
    });

    it("n'appelle pas la mutation de bascule au clic sur le bouton désactivé", () => {
      const mutate = vi.fn();
      vi.mocked(useCotisationsHooks.useModifierArticleCatalogue).mockReturnValue({
        mutate,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof useCotisationsHooks.useModifierArticleCatalogue>);

      renderWithProviders(<ArticlesCatalogueCotisationPage />);
      fireEvent.click(screen.getByText("catalogue_articles.desactiver"));

      expect(mutate).not.toHaveBeenCalled();
    });
  });
});
