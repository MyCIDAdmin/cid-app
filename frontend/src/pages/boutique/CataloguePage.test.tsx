import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import { usePanierStore } from "../../store/panierStore";
import type { Produit } from "../../types/boutique";
import CataloguePage from "./CataloguePage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useProduits: vi.fn() };
});

function produit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "p1",
    nom: "Maillot domicile CA 2026",
    categorie: "vetements",
    description: "Maillot officiel",
    prix: "45.00",
    pourcentage_reduction: null,
    prix_final: "45.00",
    image: null,
    statut: "publie",
    nouveaute: true,
    seuil_alerte_stock: 5,
    variantes: [{ id: "v1", produit: "p1", taille: "M", couleur: "", stock: 14 }],
    stock_total: 14,
    stock_faible: false,
    en_rupture: false,
    regles_reduction_actives: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("CataloguePage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    usePanierStore.setState({ articles: [] });
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: { next: null, previous: null, results: [produit()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);
  });

  it("affiche les produits publiés avec leur prix", () => {
    renderWithProviders(<CataloguePage />);
    expect(screen.getByText("Maillot domicile CA 2026")).toBeInTheDocument();
    expect(screen.getByText("45,00 €")).toBeInTheDocument();
  });

  it("ajoute un article au panier au clic sur Ajouter", () => {
    renderWithProviders(<CataloguePage />);
    fireEvent.click(screen.getByText("catalogue.ajouter"));
    expect(usePanierStore.getState().articles).toHaveLength(1);
    expect(usePanierStore.getState().articles[0].varianteId).toBe("v1");
  });

  it("désactive l'ajout quand le produit est en rupture", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          produit({
            en_rupture: true,
            stock_total: 0,
            variantes: [{ id: "v1", produit: "p1", taille: "M", couleur: "", stock: 0 }],
          }),
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<CataloguePage />);
    expect(screen.getByText("catalogue.ajouter")).toBeDisabled();
  });

  it("affiche le prix soldé (barré + réduit) quand un rabais est actif", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [produit({ prix: "50.00", pourcentage_reduction: 20, prix_final: "40.00" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<CataloguePage />);
    expect(screen.getByText("50,00 €")).toBeInTheDocument();
    expect(screen.getByText("40,00 €")).toBeInTheDocument();
  });

  it("ajoute au panier le prix soldé (prix_final), pas le prix catalogue", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [produit({ prix: "50.00", pourcentage_reduction: 20, prix_final: "40.00" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<CataloguePage />);
    fireEvent.click(screen.getByText("catalogue.ajouter"));
    expect(usePanierStore.getState().articles[0].prixUnitaire).toBe("40.00");
  });

  it("affiche un badge pour chaque palier de réduction actif", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          produit({
            regles_reduction_actives: [
              {
                id: "r1",
                produit: "p1",
                seuil_quantite: 5,
                type_reduction: "article_offert",
                pourcentage: null,
                actif: true,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
              {
                id: "r2",
                produit: "p1",
                seuil_quantite: 10,
                type_reduction: "pourcentage",
                pourcentage: 10,
                actif: true,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<CataloguePage />);
    expect(screen.getByText(/catalogue.regle_article_offert/)).toBeInTheDocument();
    expect(screen.getByText(/catalogue.regle_pourcentage/)).toBeInTheDocument();
  });

  it("transmet l'instantané des règles de réduction actives au panier", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          produit({
            regles_reduction_actives: [
              {
                id: "r1",
                produit: "p1",
                seuil_quantite: 5,
                type_reduction: "article_offert",
                pourcentage: null,
                actif: true,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<CataloguePage />);
    fireEvent.click(screen.getByText("catalogue.ajouter"));
    expect(usePanierStore.getState().articles[0].reglesReduction).toHaveLength(1);
  });

  it("affiche un message quand le catalogue est vide", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<CataloguePage />);
    expect(screen.getByText("catalogue.aucun_produit")).toBeInTheDocument();
  });
});
