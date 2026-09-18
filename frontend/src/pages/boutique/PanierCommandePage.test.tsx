import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import { useAuthStore } from "../../store/authStore";
import { usePanierStore, type ArticlePanier } from "../../store/panierStore";
import type { Commande } from "../../types/boutique";
import PanierCommandePage from "./PanierCommandePage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    usePasserCommande: vi.fn(),
    useVariantesParIds: vi.fn(),
    useInitierPaiementEnLigneCommande: vi.fn(),
  };
});

function articleTest(overrides: Partial<ArticlePanier> = {}): ArticlePanier {
  return {
    varianteId: "v1",
    produitId: "p1",
    nom: "Maillot CA",
    taille: "M",
    couleur: "",
    prixUnitaire: "45.00",
    stockDisponible: 5,
    quantite: 1,
    ...overrides,
  };
}

function commandeResultat(overrides: Partial<Commande> = {}): Commande {
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
    statut: "confirmee",
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

describe("PanierCommandePage", () => {
  let passerCommandeMock: ReturnType<typeof vi.fn>;
  let initierPaiementMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    usePanierStore.setState({ articles: [] });
    useAuthStore.setState({
      user: { id: "u1", email: "riadh@example.de", role: "membre", langue_preferee: "fr" },
      isAuthenticated: true,
      accessToken: "t",
      refreshToken: "r",
    });

    passerCommandeMock = vi.fn();
    vi.mocked(useBoutiqueHooks.usePasserCommande).mockReturnValue({
      mutate: passerCommandeMock,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.usePasserCommande>);
    // Par défaut : le stock live confirme le stock du panier (5 dispo pour "v1"), pas de
    // changement — les tests dédiés à la revalidation ("ausverkauft") le redéfinissent.
    vi.mocked(useBoutiqueHooks.useVariantesParIds).mockReturnValue({
      data: [{ id: "v1", produit: "p1", taille: "M", couleur: "", stock: 5 }],
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVariantesParIds>);

    initierPaiementMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useInitierPaiementEnLigneCommande).mockReturnValue({
      mutate: initierPaiementMock,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useInitierPaiementEnLigneCommande>);
  });

  it("affiche un message quand le panier est vide", () => {
    renderWithProviders(<PanierCommandePage />);
    expect(screen.getByText("commande.panier_vide")).toBeInTheDocument();
  });

  it("parcourt les 3 étapes puis appelle passerCommande avec les lignes attendues", () => {
    usePanierStore.setState({ articles: [articleTest()] });
    renderWithProviders(<PanierCommandePage />);

    // Étape 1 — panier
    expect(screen.getByText("Maillot CA")).toBeInTheDocument();
    fireEvent.click(screen.getByText("commande.continuer_livraison"));

    // Étape 2 — livraison
    fireEvent.change(screen.getByLabelText("commande.adresse_label"), {
      target: { value: "Musterstr. 1" },
    });
    fireEvent.change(screen.getByLabelText("commande.code_postal_label"), {
      target: { value: "10115" },
    });
    fireEvent.change(screen.getByLabelText("commande.ville_label"), {
      target: { value: "Berlin" },
    });
    fireEvent.click(screen.getByText("commande.continuer_confirmation"));

    // Étape 3 — confirmation
    expect(screen.getByText("commande.recapitulatif")).toBeInTheDocument();
    fireEvent.click(screen.getByText("commande.confirmer_commande"));

    expect(passerCommandeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lignes: [{ variante: "v1", quantite: 1 }],
        adresse_livraison: "Musterstr. 1",
        code_postal_livraison: "10115",
        ville_livraison: "Berlin",
      }),
      expect.anything(),
    );
  });

  it("marque un article ausverkauft quand le stock live est à 0 et bloque la suite", () => {
    usePanierStore.setState({ articles: [articleTest()] });
    vi.mocked(useBoutiqueHooks.useVariantesParIds).mockReturnValue({
      data: [{ id: "v1", produit: "p1", taille: "M", couleur: "", stock: 0 }],
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVariantesParIds>);

    renderWithProviders(<PanierCommandePage />);

    expect(screen.getByText("commande.article_ausverkauft")).toBeInTheDocument();
    expect(screen.getByText("commande.continuer_livraison")).toBeDisabled();
  });

  it("marque un article ausverkauft quand la variante n'est plus renvoyée par le serveur (produit dépublié)", () => {
    usePanierStore.setState({ articles: [articleTest()] });
    vi.mocked(useBoutiqueHooks.useVariantesParIds).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVariantesParIds>);

    renderWithProviders(<PanierCommandePage />);

    expect(screen.getByText("commande.article_ausverkauft")).toBeInTheDocument();
  });

  it("affiche le numéro de commande et vide le panier après succès", () => {
    usePanierStore.setState({ articles: [articleTest()] });
    passerCommandeMock.mockImplementation((_payload, { onSuccess }) => {
      onSuccess(commandeResultat());
    });

    renderWithProviders(<PanierCommandePage />);
    fireEvent.click(screen.getByText("commande.continuer_livraison"));
    fireEvent.change(screen.getByLabelText("commande.adresse_label"), {
      target: { value: "Musterstr. 1" },
    });
    fireEvent.change(screen.getByLabelText("commande.code_postal_label"), {
      target: { value: "10115" },
    });
    fireEvent.change(screen.getByLabelText("commande.ville_label"), {
      target: { value: "Berlin" },
    });
    fireEvent.click(screen.getByText("commande.continuer_confirmation"));
    fireEvent.click(screen.getByText("commande.confirmer_commande"));

    expect(screen.getByText("commande.confirmee_titre")).toBeInTheDocument();
    expect(usePanierStore.getState().articles).toEqual([]);
  });

  // Paiement en ligne (ajouté le 2026-09-17, même principe que CotisationStepperPage) — la
  // commande fraîchement passée reste "en_attente" tant que le paiement n'a pas été confirmé.
  function passerCommandeEtConfirmer() {
    usePanierStore.setState({ articles: [articleTest()] });
    passerCommandeMock.mockImplementation((_payload, { onSuccess }) => {
      onSuccess(commandeResultat({ statut: "en_attente" }));
    });
    renderWithProviders(<PanierCommandePage />);
    fireEvent.click(screen.getByText("commande.continuer_livraison"));
    fireEvent.change(screen.getByLabelText("commande.adresse_label"), {
      target: { value: "Musterstr. 1" },
    });
    fireEvent.change(screen.getByLabelText("commande.code_postal_label"), {
      target: { value: "10115" },
    });
    fireEvent.change(screen.getByLabelText("commande.ville_label"), {
      target: { value: "Berlin" },
    });
    fireEvent.click(screen.getByText("commande.continuer_confirmation"));
    fireEvent.click(screen.getByText("commande.confirmer_commande"));
  }

  // Paiement en ligne mis en pause côté UI depuis le 2026-09-19 (retour utilisateur, voir
  // PAIEMENT_EN_LIGNE_ACTIF/docstring de module) : les boutons Stripe/PayPal réels ne sont plus
  // affichés, remplacés par les coordonnées bancaires/PayPal de l'association.
  it("affiche les coordonnées de paiement hors ligne quand la commande reste en_attente après passer()", () => {
    passerCommandeEtConfirmer();

    expect(screen.queryByText("commande.payer_stripe")).not.toBeInTheDocument();
    expect(screen.queryByText("commande.payer_paypal")).not.toBeInTheDocument();
    expect(screen.getByText("commande.payer_hors_ligne_titre")).toBeInTheDocument();
    expect(screen.getByText("paiement_instructions.virement_titre")).toBeInTheDocument();
    expect(screen.getByText("DE38 1009 000 2891 4900 06")).toBeInTheDocument();
    expect(screen.getByText("paiement_instructions.paypal_titre")).toBeInTheDocument();
    expect(screen.getByText("info@clubistesindeutschland.org")).toBeInTheDocument();
    expect(screen.getByText("commande.payer_plus_tard")).toBeInTheDocument();
    expect(initierPaiementMock).not.toHaveBeenCalled();
  });

  it("ne propose pas de payer en ligne quand la commande est déjà confirmée (statut par défaut)", () => {
    usePanierStore.setState({ articles: [articleTest()] });
    passerCommandeMock.mockImplementation((_payload, { onSuccess }) => {
      onSuccess(commandeResultat());
    });
    renderWithProviders(<PanierCommandePage />);
    fireEvent.click(screen.getByText("commande.continuer_livraison"));
    fireEvent.change(screen.getByLabelText("commande.adresse_label"), {
      target: { value: "Musterstr. 1" },
    });
    fireEvent.change(screen.getByLabelText("commande.code_postal_label"), {
      target: { value: "10115" },
    });
    fireEvent.change(screen.getByLabelText("commande.ville_label"), {
      target: { value: "Berlin" },
    });
    fireEvent.click(screen.getByText("commande.continuer_confirmation"));
    fireEvent.click(screen.getByText("commande.confirmer_commande"));

    expect(screen.queryByText("commande.payer_stripe")).not.toBeInTheDocument();
    expect(screen.getByText("commande.retour_catalogue")).toBeInTheDocument();
  });

  // Les 2 tests ci-dessous remplacent les anciens "initie le paiement Stripe et redirige vers
  // l'URL renvoyée" / "affiche une erreur si l'initiation du paiement PayPal échoue", qui
  // exerçaient les boutons Stripe/PayPal réels désormais masqués (PAIEMENT_EN_LIGNE_ACTIF=false,
  // voir docstring de module) — le code de paiement en ligne (useInitierPaiementEnLigneCommande)
  // reste intact mais n'est plus jamais appelé depuis cette page pour le moment.
  it("n'appelle jamais la passerelle réelle depuis l'écran de confirmation (paiement en ligne en pause)", () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: "" },
    });

    passerCommandeEtConfirmer();

    expect(initierPaiementMock).not.toHaveBeenCalled();
    expect(window.location.href).toBe("");
    expect(screen.queryByText("commande.erreur_paiement")).not.toBeInTheDocument();
  });
});
