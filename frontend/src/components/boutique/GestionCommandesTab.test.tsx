import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Commande } from "../../types/boutique";
import GestionCommandesTab from "./GestionCommandesTab";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useCommandes: vi.fn(),
    useChangerStatutCommande: vi.fn(),
    useAnnulerCommande: vi.fn(),
  };
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
    statut: "en_attente",
    lignes: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("GestionCommandesTab", () => {
  let changerStatutMock: ReturnType<typeof vi.fn>;
  let annulerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    changerStatutMock = vi.fn();
    annulerMock = vi.fn();

    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande()] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);
    vi.mocked(useBoutiqueHooks.useChangerStatutCommande).mockReturnValue({
      mutate: changerStatutMock,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useChangerStatutCommande>);
    vi.mocked(useBoutiqueHooks.useAnnulerCommande).mockReturnValue({
      mutate: annulerMock,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAnnulerCommande>);
  });

  it("affiche la commande avec son numéro et son montant", () => {
    renderWithProviders(<GestionCommandesTab />);
    expect(screen.getByText("CMD-A1B2C3D4")).toBeInTheDocument();
    expect(screen.getByText("45,00 €")).toBeInTheDocument();
  });

  it("change le statut via le sélecteur de transition", () => {
    renderWithProviders(<GestionCommandesTab />);
    fireEvent.change(screen.getByLabelText("commandes_admin.changer_statut"), {
      target: { value: "confirmee" },
    });
    expect(changerStatutMock).toHaveBeenCalledWith({
      id: "c1",
      payload: { statut: "confirmee" },
    });
  });

  it("demande confirmation puis annule la commande", () => {
    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("commandes_admin.annuler"));
    expect(screen.getByText("commandes_admin.confirmer_annulation_titre")).toBeInTheDocument();

    fireEvent.click(screen.getByText("action.confirmer"));
    expect(annulerMock).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("ne propose ni transition ni annulation pour une commande livrée", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "livree" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    expect(screen.queryByText("commandes_admin.annuler")).not.toBeInTheDocument();
  });
});
