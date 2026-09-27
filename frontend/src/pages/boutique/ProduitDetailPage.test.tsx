import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import { usePanierStore } from "../../store/panierStore";
import type { Produit } from "../../types/boutique";
import ProduitDetailPage from "./ProduitDetailPage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useProduit: vi.fn() };
});

function produit(overrides: Partial<Produit> = {}): Produit {
  const base: Omit<Produit, "prix_affiche" | "est_prix_membre"> = {
    id: "p1",
    nom: "Maillot domicile CA 2026",
    categorie: "vetements",
    description: "Maillot officiel",
    prix: "45.00",
    pourcentage_reduction: null,
    prix_final: "45.00",
    prix_membre: null,
    image: null,
    images: [],
    statut: "publie",
    type_produit: "physique",
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
  return {
    ...base,
    prix_affiche: overrides.prix_affiche ?? base.prix_final,
    est_prix_membre: overrides.est_prix_membre ?? false,
  };
}

function renderPage() {
  return renderWithProviders(<ProduitDetailPage />, {
    route: "/boutique/p1",
    path: "/boutique/:id",
  });
}

describe("ProduitDetailPage", () => {
  beforeEach(() => {
    usePanierStore.setState({ articles: [] });
  });

  it("affiche le titre, la catégorie et le prix du produit", () => {
    vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
      data: produit(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

    renderPage();

    expect(screen.getByText("Maillot domicile CA 2026")).toBeInTheDocument();
    expect(screen.getByText("categorie.vetements")).toBeInTheDocument();
    expect(screen.getByText("45,00 €")).toBeInTheDocument();
  });

  it("affiche le badge « Mitglieder Preis » (prix membre) avec le prix barré", () => {
    vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
      data: produit({ prix_affiche: "35.00", est_prix_membre: true }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

    renderPage();

    expect(screen.getAllByText("catalogue.badge_prix_membre").length).toBeGreaterThan(0);
    expect(screen.getByText("35,00 €")).toBeInTheDocument();
    expect(screen.getByText("45,00 €")).toBeInTheDocument();
  });

  it("ajoute le produit au panier avec le prix affiché (prix_affiche), pas le prix catalogue", () => {
    vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
      data: produit({ prix_affiche: "35.00", est_prix_membre: true }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

    renderPage();
    fireEvent.click(screen.getByText(/catalogue.ajouter/));

    expect(usePanierStore.getState().articles).toHaveLength(1);
    expect(usePanierStore.getState().articles[0].prixUnitaire).toBe("35.00");
    expect(usePanierStore.getState().articles[0].varianteId).toBe("v1");
  });

  it("désactive l'ajout et affiche « Rupture de stock » quand la variante est épuisée", () => {
    vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
      data: produit({
        en_rupture: true,
        stock_total: 0,
        variantes: [{ id: "v1", produit: "p1", taille: "M", couleur: "", stock: 0 }],
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

    renderPage();

    expect(screen.getByRole("button", { name: /catalogue.rupture/ })).toBeDisabled();
  });

  it("propose un lien vers le catalogue plutôt qu'un sélecteur pour un bon d'achat", () => {
    vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
      data: produit({
        id: "pb1",
        nom: "Bon d'achat CID",
        categorie: "bon_achat",
        type_produit: "bon_achat",
        prix: "5.00",
        prix_final: "5.00",
        variantes: [{ id: "vb1", produit: "pb1", taille: "", couleur: "", stock: 999999 }],
        stock_total: 999999,
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

    renderPage();

    expect(screen.getByText("detail.choisir_montant_catalogue")).toBeInTheDocument();
    expect(screen.queryByText(/catalogue.ajouter/)).not.toBeInTheDocument();
  });

  it("affiche un message d'erreur quand le produit ne peut pas être chargé", () => {
    vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

    renderPage();

    expect(screen.getByText("catalogue.erreur")).toBeInTheDocument();
  });

  // Galerie de photos supplémentaires (demande utilisateur du 2026-09-27, point 13.1).
  describe("galerie de photos", () => {
    it("n'affiche pas de vignettes quand le produit n'a qu'une seule photo (ou aucune)", () => {
      vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
        data: produit({ image: "https://cdn.example.de/produits/p1.jpg", images: [] }),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

      renderPage();

      expect(screen.queryByLabelText(/detail.galerie_vignette/)).not.toBeInTheDocument();
    });

    it("affiche une vignette par photo (principale + galerie) et bascule l'image affichée au clic", () => {
      vi.mocked(useBoutiqueHooks.useProduit).mockReturnValue({
        data: produit({
          image: "https://cdn.example.de/produits/principale.jpg",
          images: [
            {
              id: "img1",
              produit: "p1",
              image: "https://cdn.example.de/produits/galerie1.jpg",
              ordre: 0,
              uploaded_by: "m1",
              created_at: "2026-01-01T00:00:00Z",
            },
            {
              id: "img2",
              produit: "p1",
              image: "https://cdn.example.de/produits/galerie2.jpg",
              ordre: 1,
              uploaded_by: "m1",
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
        }),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useBoutiqueHooks.useProduit>);

      renderPage();

      const vignettes = screen.getAllByLabelText(/detail.galerie_vignette/);
      expect(vignettes).toHaveLength(3);

      const heroAvant = screen.getByAltText("Maillot domicile CA 2026") as HTMLImageElement;
      expect(heroAvant.src).toBe("https://cdn.example.de/produits/principale.jpg");

      fireEvent.click(vignettes[2]);

      const heroApres = screen.getByAltText("Maillot domicile CA 2026") as HTMLImageElement;
      expect(heroApres.src).toBe("https://cdn.example.de/produits/galerie2.jpg");
    });
  });
});
