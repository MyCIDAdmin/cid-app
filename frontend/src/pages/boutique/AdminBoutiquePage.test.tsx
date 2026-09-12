import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Commande, Produit } from "../../types/boutique";
import AdminBoutiquePage from "./AdminBoutiquePage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useCommandes: vi.fn(),
    useProduits: vi.fn(),
    useChangerStatutCommande: vi.fn(),
    useAnnulerCommande: vi.fn(),
    useCreerProduit: vi.fn(),
    useModifierProduit: vi.fn(),
    useVariantes: vi.fn(),
    useCreerVariante: vi.fn(),
    useModifierVariante: vi.fn(),
    useSupprimerVariante: vi.fn(),
  };
});

function produit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "p1",
    nom: "Maillot CA",
    categorie: "vetements",
    description: "",
    prix: "45.00",
    image: null,
    statut: "publie",
    nouveaute: false,
    seuil_alerte_stock: 5,
    variantes: [],
    stock_total: 10,
    stock_faible: false,
    en_rupture: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function commande(overrides: Partial<Commande> = {}): Commande {
  return {
    id: "c1",
    numero_commande: "CMD-A1B2C3D4",
    membre: "m1",
    nom_destinataire: "Riadh Bchini",
    adresse_livraison: "",
    code_postal_livraison: "",
    ville_livraison: "",
    pays_livraison: "Allemagne",
    telephone_livraison: "",
    montant_total: "45.00",
    statut: "en_attente",
    lignes: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("AdminBoutiquePage", () => {
  beforeEach(() => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande()] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: { next: null, previous: null, results: [produit(), produit({ id: "p2", statut: "brouillon" })] },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);
    vi.mocked(useBoutiqueHooks.useChangerStatutCommande).mockReturnValue({
      mutate: vi.fn(),
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useChangerStatutCommande>);
    vi.mocked(useBoutiqueHooks.useAnnulerCommande).mockReturnValue({
      mutate: vi.fn(),
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAnnulerCommande>);
    vi.mocked(useBoutiqueHooks.useCreerProduit).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerProduit>);
    vi.mocked(useBoutiqueHooks.useModifierProduit).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useModifierProduit>);
    vi.mocked(useBoutiqueHooks.useVariantes).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVariantes>);
    vi.mocked(useBoutiqueHooks.useCreerVariante).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerVariante>);
    vi.mocked(useBoutiqueHooks.useModifierVariante).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useModifierVariante>);
    vi.mocked(useBoutiqueHooks.useSupprimerVariante).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerVariante>);
  });

  it("affiche les tuiles KPI calculées depuis les commandes/produits chargés", () => {
    renderWithProviders(<AdminBoutiquePage />);
    // 1 commande en_attente, 1 produit publié sur 2 au total
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("bascule entre l'onglet Commandes et l'onglet Catalogue", () => {
    renderWithProviders(<AdminBoutiquePage />);
    expect(screen.getByText("CMD-A1B2C3D4")).toBeInTheDocument();

    fireEvent.click(screen.getByText("admin.onglet_catalogue"));
    expect(screen.getByText("catalogue_admin.nouveau_produit")).toBeInTheDocument();
  });
});
