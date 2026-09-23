import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Produit, RegleReduction } from "../../types/boutique";
import RegleReductionManager from "./RegleReductionManager";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useReglesReduction: vi.fn(),
    useCreerRegleReduction: vi.fn(),
    useModifierRegleReduction: vi.fn(),
    useSupprimerRegleReduction: vi.fn(),
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
    type_produit: "physique",
    nouveaute: false,
    seuil_alerte_stock: 5,
    variantes: [],
    stock_total: 30,
    stock_faible: false,
    en_rupture: false,
    regles_reduction_actives: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function regle(overrides: Partial<RegleReduction> = {}): RegleReduction {
  return {
    id: "r1",
    produit: "p1",
    seuil_quantite: 5,
    type_reduction: "article_offert",
    pourcentage: null,
    actif: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("RegleReductionManager", () => {
  let creerMock: ReturnType<typeof vi.fn>;
  let modifierMock: ReturnType<typeof vi.fn>;
  let supprimerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    creerMock = vi.fn();
    modifierMock = vi.fn();
    supprimerMock = vi.fn();

    vi.mocked(useBoutiqueHooks.useReglesReduction).mockReturnValue({
      data: { next: null, previous: null, results: [regle()] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useReglesReduction>);
    vi.mocked(useBoutiqueHooks.useCreerRegleReduction).mockReturnValue({
      mutate: creerMock,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerRegleReduction>);
    vi.mocked(useBoutiqueHooks.useModifierRegleReduction).mockReturnValue({
      mutate: modifierMock,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useModifierRegleReduction>);
    vi.mocked(useBoutiqueHooks.useSupprimerRegleReduction).mockReturnValue({
      mutate: supprimerMock,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerRegleReduction>);
  });

  it("affiche les règles existantes avec leur libellé", () => {
    renderWithProviders(<RegleReductionManager produit={produit()} />);
    expect(screen.getByText(/catalogue.regle_article_offert/)).toBeInTheDocument();
  });

  it("se replie sur regles_reduction_actives du produit tant que la requête charge", () => {
    vi.mocked(useBoutiqueHooks.useReglesReduction).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useReglesReduction>);

    renderWithProviders(
      <RegleReductionManager
        produit={produit({
          regles_reduction_actives: [regle({ id: "r-fallback", seuil_quantite: 8 })],
        })}
      />,
    );
    expect(screen.getByText(/catalogue.regle_article_offert/)).toBeInTheDocument();
  });

  it("affiche un message quand aucun palier n'existe", () => {
    vi.mocked(useBoutiqueHooks.useReglesReduction).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useReglesReduction>);

    renderWithProviders(<RegleReductionManager produit={produit()} />);
    expect(screen.getByText("catalogue_admin.aucune_regle")).toBeInTheDocument();
  });

  it("ajoute un palier de type pourcentage via le formulaire", () => {
    renderWithProviders(<RegleReductionManager produit={produit()} />);

    fireEvent.change(screen.getByLabelText("catalogue_admin.seuil_quantite_label"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_admin.type_reduction_label"), {
      target: { value: "pourcentage" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_admin.rabais_label"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByText("catalogue_admin.ajouter_regle"));

    expect(creerMock).toHaveBeenCalledWith(
      {
        produit: "p1",
        seuil_quantite: 10,
        type_reduction: "pourcentage",
        pourcentage: 15,
      },
      expect.anything(),
    );
  });

  it("ajoute un palier de type article offert sans champ pourcentage", () => {
    renderWithProviders(<RegleReductionManager produit={produit()} />);

    fireEvent.change(screen.getByLabelText("catalogue_admin.seuil_quantite_label"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByText("catalogue_admin.ajouter_regle"));

    expect(creerMock).toHaveBeenCalledWith(
      {
        produit: "p1",
        seuil_quantite: 5,
        type_reduction: "article_offert",
        pourcentage: null,
      },
      expect.anything(),
    );
    expect(screen.queryByLabelText("catalogue_admin.rabais_label")).not.toBeInTheDocument();
  });

  it("bascule l'état actif d'un palier via la case à cocher", () => {
    renderWithProviders(<RegleReductionManager produit={produit()} />);
    fireEvent.click(screen.getByLabelText("catalogue_admin.regle_active_label"));
    expect(modifierMock).toHaveBeenCalledWith({ id: "r1", payload: { actif: false } });
  });

  it("supprime un palier au clic sur le bouton de suppression", () => {
    renderWithProviders(<RegleReductionManager produit={produit()} />);
    fireEvent.click(screen.getByRole("button", { name: "catalogue_admin.supprimer_regle" }));
    expect(supprimerMock).toHaveBeenCalledWith("r1");
  });
});
