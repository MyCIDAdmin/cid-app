import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Produit } from "../../types/boutique";
import GestionCatalogueTab from "./GestionCatalogueTab";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useProduits: vi.fn(),
    useCreerProduit: vi.fn(),
    useModifierProduit: vi.fn(),
    useTeleverserImageProduit: vi.fn(),
    useVariantes: vi.fn(),
    useCreerVariante: vi.fn(),
    useModifierVariante: vi.fn(),
    useSupprimerVariante: vi.fn(),
  };
});

function produit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "p1",
    nom: "Mug CA 1920",
    categorie: "articles_club",
    description: "",
    prix: "18.00",
    pourcentage_reduction: null,
    prix_final: "18.00",
    image: null,
    statut: "publie",
    nouveaute: false,
    seuil_alerte_stock: 5,
    variantes: [],
    stock_total: 3,
    stock_faible: true,
    en_rupture: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("GestionCatalogueTab", () => {
  let creerMock: ReturnType<typeof vi.fn>;
  let modifierMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    creerMock = vi.fn();
    modifierMock = vi.fn();

    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: { next: null, previous: null, results: [produit()] },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);
    vi.mocked(useBoutiqueHooks.useCreerProduit).mockReturnValue({
      mutate: creerMock,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerProduit>);
    vi.mocked(useBoutiqueHooks.useModifierProduit).mockReturnValue({
      mutate: modifierMock,
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
  });

  it("affiche les produits existants avec leur alerte de stock faible", () => {
    renderWithProviders(<GestionCatalogueTab />);
    expect(screen.getByText("Mug CA 1920")).toBeInTheDocument();
    expect(screen.getByText(/catalogue_admin.stock_faible/)).toBeInTheDocument();
  });

  it("soumet le formulaire de création avec les champs saisis", () => {
    renderWithProviders(<GestionCatalogueTab />);

    fireEvent.change(screen.getByLabelText("catalogue_admin.nom_label"), {
      target: { value: "Écharpe CA" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_admin.prix_label"), {
      target: { value: "22.00" },
    });
    fireEvent.click(screen.getByText("catalogue_admin.creer"));

    expect(creerMock).toHaveBeenCalledWith(
      expect.objectContaining({ nom: "Écharpe CA", prix: "22.00" }),
      expect.anything(),
    );
  });

  it("change le statut d'un produit via le sélecteur", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.change(screen.getByLabelText("catalogue_admin.changer_statut"), {
      target: { value: "archive" },
    });
    expect(modifierMock).toHaveBeenCalledWith({ id: "p1", payload: { statut: "archive" } });
  });

  it("déplie le panneau de gestion des variantes", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_variantes"));
    expect(screen.getByText("catalogue_admin.variantes_titre")).toBeInTheDocument();
  });

  it("inclut le stock initial saisi à la création", () => {
    renderWithProviders(<GestionCatalogueTab />);

    fireEvent.change(screen.getByLabelText("catalogue_admin.nom_label"), {
      target: { value: "Écharpe CA" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_admin.stock_initial_label"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByText("catalogue_admin.creer"));

    expect(creerMock).toHaveBeenCalledWith(
      expect.objectContaining({ nom: "Écharpe CA", stock_initial: 12 }),
      expect.anything(),
    );
  });

  it("modifie le rabais d'un produit existant", () => {
    renderWithProviders(<GestionCatalogueTab />);
    const champRabais = screen.getByLabelText("catalogue_admin.rabais_label — Mug CA 1920");
    fireEvent.change(champRabais, { target: { value: "20" } });
    fireEvent.blur(champRabais);
    expect(modifierMock).toHaveBeenCalledWith({
      id: "p1",
      payload: { pourcentage_reduction: 20 },
    });
  });

  it("affiche le prix soldé et le prix barré quand un rabais est actif", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [produit({ prix: "18.00", pourcentage_reduction: 20, prix_final: "14.40" })],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);
    renderWithProviders(<GestionCatalogueTab />);
    expect(screen.getByText("14,40 €")).toBeInTheDocument();
  });
});
