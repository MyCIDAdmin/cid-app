import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Commande } from "../../types/boutique";
import CommandeRetourPage from "./CommandeRetourPage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useCommande: vi.fn(),
    useInitierPaiementEnLigneCommande: vi.fn(),
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

function renderPage(route = "/boutique/commande/retour?commande=c1") {
  return renderWithProviders(<CommandeRetourPage />, {
    route,
    path: "/boutique/commande/retour",
  });
}

describe("CommandeRetourPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: "" },
    });
    vi.mocked(useBoutiqueHooks.useInitierPaiementEnLigneCommande).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useInitierPaiementEnLigneCommande>);
  });

  it("affiche un message d'erreur si aucun identifiant de commande n'est fourni", () => {
    vi.mocked(useBoutiqueHooks.useCommande).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommande>);

    renderPage("/boutique/commande/retour");

    expect(screen.getByText("retour_paiement.introuvable")).toBeInTheDocument();
  });

  it("affiche la confirmation pour une commande confirmée", () => {
    vi.mocked(useBoutiqueHooks.useCommande).mockReturnValue({
      data: commande({ statut: "confirmee", reference_paiement: "STRIPE-pi_1" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommande>);

    renderPage();

    expect(screen.getByText("retour_paiement.titre_confirmee")).toBeInTheDocument();
    expect(screen.getByText("CMD-A1B2C3D4")).toBeInTheDocument();
    // Une commande déjà confirmée ne propose plus de réessayer le paiement.
    expect(screen.queryByText("retour_paiement.reessayer_stripe")).not.toBeInTheDocument();
  });

  it("permet de réessayer le paiement (Stripe/PayPal) pour une commande restée en attente", async () => {
    const mutateInitier = vi.fn(
      (
        _variables,
        opts?: { onSuccess?: (r: { redirect_url: string }) => void },
      ) => opts?.onSuccess?.({ redirect_url: "https://checkout.stripe.com/session/retry" }),
    );
    vi.mocked(useBoutiqueHooks.useCommande).mockReturnValue({
      data: commande({ statut: "en_attente" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommande>);
    vi.mocked(useBoutiqueHooks.useInitierPaiementEnLigneCommande).mockReturnValue({
      mutate: mutateInitier,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useInitierPaiementEnLigneCommande>);

    renderPage();

    expect(screen.getByText("retour_paiement.titre_attente")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retour_paiement.reessayer_stripe"));

    expect(mutateInitier).toHaveBeenCalledWith(
      { id: "c1", payload: { passerelle: "stripe" } },
      expect.anything(),
    );
    await waitFor(() =>
      expect(window.location.href).toBe("https://checkout.stripe.com/session/retry"),
    );
  });

  it("affiche le message d'annulation quand le membre revient avec annule=1", () => {
    vi.mocked(useBoutiqueHooks.useCommande).mockReturnValue({
      data: commande({ statut: "en_attente" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommande>);

    renderPage("/boutique/commande/retour?commande=c1&annule=1");

    expect(screen.getByText("retour_paiement.titre_annule")).toBeInTheDocument();
  });

  it("permet de vérifier à nouveau une commande encore en attente", () => {
    const refetch = vi.fn();
    vi.mocked(useBoutiqueHooks.useCommande).mockReturnValue({
      data: commande({ statut: "en_attente" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommande>);

    renderPage();

    expect(screen.getByText("retour_paiement.titre_attente")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retour_paiement.verifier"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
