import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import * as useRbacHooks from "../../hooks/useRbac";
import type { BonAchat, Commande, Produit } from "../../types/boutique";
import AdminBoutiquePage from "./AdminBoutiquePage";

// Task #216 (2026-09-24) : "page_boutique" lecture/lecture_ecriture — plein accès par défaut
// pour ne pas casser les tests existants (comportement identique à avant l'ajout de la matrice) ;
// voir le describe dédié plus bas pour le mode lecture seule.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
});

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
    useTeleverserImageProduit: vi.fn(),
    useVariantes: vi.fn(),
    useCreerVariante: vi.fn(),
    useModifierVariante: vi.fn(),
    useSupprimerVariante: vi.fn(),
    useReglesReduction: vi.fn(),
    useCreerRegleReduction: vi.fn(),
    useModifierRegleReduction: vi.fn(),
    useSupprimerRegleReduction: vi.fn(),
    useBonsAchat: vi.fn(),
  };
});

function produit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "p1",
    nom: "Maillot CA",
    categorie: "vetements",
    description: "",
    prix: "45.00",
    pourcentage_reduction: null,
    prix_final: "45.00",
    prix_membre: null,
    prix_affiche: "45.00",
    est_prix_membre: false,
    image: null,
    images: [],
    statut: "publie",
    type_produit: "physique",
    nouveaute: false,
    seuil_alerte_stock: 5,
    variantes: [],
    stock_total: 10,
    stock_faible: false,
    en_rupture: false,
    regles_reduction_actives: [],
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
    bon_achat: null,
    montant_bon_achat: "0.00",
    montant_du: "45.00",
    statut: "en_attente",
    mode_paiement: "",
    date_paiement_confirme: null,
    paiement_confirme_par: null,
    reference_paiement: "",
    numero_suivi: "",
    transporteur: "",
    date_expedition: null,
    lignes: [],
    retours: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function bonAchat(overrides: Partial<BonAchat> = {}): BonAchat {
  return {
    id: "b1",
    code: "BON-A1B2C3D4",
    montant_initial: "50.00",
    solde: "50.00",
    statut: "actif",
    achete_par: "m1",
    mode_paiement: "en_ligne",
    date_paiement_confirme: "2026-01-01T00:00:00Z",
    paiement_confirme_par: null,
    reference_paiement: "",
    date_expiration: "2029-01-01T00:00:00Z",
    utilisable: true,
    est_expire: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("AdminBoutiquePage", () => {
  beforeEach(() => {
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande()] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [produit(), produit({ id: "p2", statut: "brouillon" })],
      },
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
    vi.mocked(useBoutiqueHooks.useTeleverserImageProduit).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useTeleverserImageProduit>);
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
    vi.mocked(useBoutiqueHooks.useReglesReduction).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useReglesReduction>);
    vi.mocked(useBoutiqueHooks.useCreerRegleReduction).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerRegleReduction>);
    vi.mocked(useBoutiqueHooks.useModifierRegleReduction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useModifierRegleReduction>);
    vi.mocked(useBoutiqueHooks.useSupprimerRegleReduction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerRegleReduction>);
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: { next: null, previous: null, results: [bonAchat()] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);
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

  it("bascule vers l'onglet Bons d'achat", () => {
    renderWithProviders(<AdminBoutiquePage />);
    fireEvent.click(screen.getByText("admin.onglet_bons_achat"));
    expect(screen.getByText("BON-A1B2C3D4")).toBeInTheDocument();
    expect(screen.queryByText("CMD-A1B2C3D4")).not.toBeInTheDocument();
  });

  describe("accès lecture seule (task #216)", () => {
    it("n'affiche pas de bandeau et laisse les contrôles d'écriture actifs quand modifiable=true", () => {
      renderWithProviders(<AdminBoutiquePage />);

      expect(screen.queryByText("acces.lecture_seule_banniere")).not.toBeInTheDocument();
      expect(screen.getByLabelText("commandes_admin.changer_statut")).not.toBeDisabled();

      fireEvent.click(screen.getByText("admin.onglet_catalogue"));
      expect(screen.getByText("catalogue_admin.creer")).not.toBeDisabled();
    });

    it("affiche un bandeau et désactive les contrôles d'écriture quand modifiable=false", () => {
      vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
        accessible: true,
        modifiable: false,
        isLoading: false,
      });

      renderWithProviders(<AdminBoutiquePage />);

      expect(screen.getByText("acces.lecture_seule_banniere")).toBeInTheDocument();
      // Lecture : la commande reste visible.
      expect(screen.getByText("CMD-A1B2C3D4")).toBeInTheDocument();
      expect(screen.getByLabelText("commandes_admin.changer_statut")).toBeDisabled();

      fireEvent.click(screen.getByText("admin.onglet_catalogue"));
      expect(screen.getByText("catalogue_admin.creer")).toBeDisabled();
    });
  });
});
