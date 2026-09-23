import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Commande } from "../../types/boutique";
import MesCommandesPage from "./MesCommandesPage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useCommandes: vi.fn(), useAnnulerCommande: vi.fn() };
});

function commande(overrides: Partial<Commande> = {}): Commande {
  return {
    id: "c1",
    numero_commande: "CMD-A1B2C3D4",
    membre: "m1",
    nom_destinataire: "Riadh Bchini",
    adresse_livraison: "Musterstr. 1",
    code_postal_livraison: "10115",
    ville_livraison: "Berlin",
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
    lignes: [
      {
        id: "l1",
        variante: "v1",
        quantite: 2,
        prix_unitaire: "22.50",
        sous_total: "45.00",
        quantite_offerte: 0,
        pourcentage_reduction_quantite: null,
        reduction_quantite: "0.00",
        sous_total_net: "45.00",
        quantite_retournee: 0,
        quantite_retournable: 2,
      },
    ],
    retours: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderPage(route = "/boutique/commandes") {
  return renderWithProviders(<MesCommandesPage />, { route, path: "/boutique/commandes" });
}

describe("MesCommandesPage", () => {
  let annulerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    annulerMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useAnnulerCommande).mockReturnValue({
      mutate: annulerMock,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAnnulerCommande>);
  });

  it("affiche les commandes du membre avec leur statut et montant", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderPage();

    expect(screen.getByText("CMD-A1B2C3D4", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("45,00 €")).toBeInTheDocument();
    expect(screen.getByText("statut_commande.en_attente")).toBeInTheDocument();
  });

  it("affiche un message et un lien vers le catalogue quand il n'y a aucune commande", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderPage();

    expect(screen.getByText("mes_commandes.aucune_commande")).toBeInTheDocument();
    expect(screen.getByText("mes_commandes.retour_catalogue")).toBeInTheDocument();
  });

  it("propose d'annuler uniquement les commandes encore annulables", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [commande({ id: "c1", statut: "en_attente" }), commande({ id: "c2", statut: "livree" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderPage();

    expect(screen.getAllByText("mes_commandes.annuler")).toHaveLength(1);
  });

  it("annule la commande après confirmation dans la boîte de dialogue", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "en_attente" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderPage();

    fireEvent.click(screen.getByText("mes_commandes.annuler"));
    fireEvent.click(screen.getByText("action.confirmer"));

    expect(annulerMock).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("met en évidence la commande ciblée par ?commande=", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [commande({ id: "c1" }), commande({ id: "c2", numero_commande: "CMD-XYZ" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderPage("/boutique/commandes?commande=c2");

    expect(screen.getByText("CMD-XYZ", { exact: false })).toBeInTheDocument();
  });
});
