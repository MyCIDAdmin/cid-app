import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import { useAuthStore } from "../../store/authStore";
import type { Commande } from "../../types/boutique";
import GestionCommandesTab from "./GestionCommandesTab";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useCommandes: vi.fn(),
    useChangerStatutCommande: vi.fn(),
    useAnnulerCommande: vi.fn(),
    useConfirmerPaiementCommande: vi.fn(),
    useExpedierCommande: vi.fn(),
    useCreerRetour: vi.fn(),
  };
});

const dirFinancier = {
  id: "u1",
  email: "df@example.com",
  role: "dir_financier" as const,
  langue_preferee: "fr" as const,
};

const bureauAdmin = {
  id: "u2",
  email: "bureau@example.com",
  role: "bureau_admin" as const,
  langue_preferee: "fr" as const,
};

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
    lignes: [],
    retours: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("GestionCommandesTab", () => {
  let changerStatutMock: ReturnType<typeof vi.fn>;
  let annulerMock: ReturnType<typeof vi.fn>;
  let confirmerPaiementMock: ReturnType<typeof vi.fn>;
  let expedierMock: ReturnType<typeof vi.fn>;
  let creerRetourMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: dirFinancier,
      isAuthenticated: true,
    });

    changerStatutMock = vi.fn();
    annulerMock = vi.fn();
    confirmerPaiementMock = vi.fn();
    expedierMock = vi.fn();
    creerRetourMock = vi.fn();

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
    vi.mocked(useBoutiqueHooks.useConfirmerPaiementCommande).mockReturnValue({
      mutate: confirmerPaiementMock,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useConfirmerPaiementCommande>);
    vi.mocked(useBoutiqueHooks.useExpedierCommande).mockReturnValue({
      mutate: expedierMock,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useExpedierCommande>);
    vi.mocked(useBoutiqueHooks.useCreerRetour).mockReturnValue({
      mutate: creerRetourMock,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerRetour>);
  });

  it("affiche la commande avec son numéro et son montant", () => {
    renderWithProviders(<GestionCommandesTab />);
    expect(screen.getByText("CMD-A1B2C3D4")).toBeInTheDocument();
    expect(screen.getByText("45,00 €")).toBeInTheDocument();
  });

  it("change le statut via le sélecteur de transition", () => {
    // EN_ATTENTE -> CONFIRMEE ne passe plus par ce sélecteur (voir confirmer_paiement
    // ci-dessous) : CONFIRMEE -> EN_PREPARATION reste une transition générale valide.
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "confirmee" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    fireEvent.change(screen.getByLabelText("commandes_admin.changer_statut"), {
      target: { value: "en_preparation" },
    });
    expect(changerStatutMock).toHaveBeenCalledWith({
      id: "c1",
      payload: { statut: "en_preparation" },
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

  // --- confirmer_paiement / expedier / retours (Directeur Financier+ pour paiement et
  // expédition, Bureau Admin+ pour les retours — voir le gating de rôle dans le composant) ---

  it("confirme le paiement avec le mode sélectionné (Directeur Financier+)", () => {
    renderWithProviders(<GestionCommandesTab />);
    fireEvent.change(screen.getByLabelText("paiement.mode_label"), {
      target: { value: "especes" },
    });
    fireEvent.click(screen.getByText("paiement.confirmer"));
    expect(confirmerPaiementMock).toHaveBeenCalledWith({
      id: "c1",
      payload: { mode_paiement: "especes" },
    });
  });

  it("masque la confirmation de paiement pour un rôle inférieur à Directeur Financier", () => {
    useAuthStore.setState({ user: bureauAdmin });
    renderWithProviders(<GestionCommandesTab />);
    expect(screen.queryByText("paiement.confirmer")).not.toBeInTheDocument();
    expect(screen.queryByText("expedition.expedier")).not.toBeInTheDocument();
    expect(screen.queryByText("nacherfassung.bouton")).not.toBeInTheDocument();
  });

  it("expédie la commande via la modale (flux normal)", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "confirmee" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("expedition.expedier"));
    expect(screen.getByText("expedition.titre")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("expedition.numero_suivi_label"), {
      target: { value: "DHL123" },
    });
    fireEvent.click(screen.getByText("expedition.confirmer"));

    expect(expedierMock).toHaveBeenCalledWith(
      {
        id: "c1",
        payload: { numero_suivi: "DHL123", transporteur: undefined, nacherfassement: false },
      },
      expect.anything(),
    );
  });

  it("le bouton d'expédition reste désactivé tant qu'aucun numéro de suivi n'est saisi", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "confirmee" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("expedition.expedier"));
    expect(screen.getByText("expedition.confirmer")).toBeDisabled();
  });

  it("propose la nacherfassung pour une commande en attente et envoie le mode de paiement", () => {
    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("nacherfassung.bouton"));
    expect(screen.getByText("nacherfassung.titre")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("expedition.numero_suivi_label"), {
      target: { value: "LEGACY01" },
    });
    fireEvent.click(screen.getByText("nacherfassung.confirmer"));

    expect(expedierMock).toHaveBeenCalledWith(
      {
        id: "c1",
        payload: {
          numero_suivi: "LEGACY01",
          transporteur: undefined,
          nacherfassement: true,
          mode_paiement: "especes",
        },
      },
      expect.anything(),
    );
  });

  it("propose un retour pour une commande expédiée avec du stock retournable, réservé Bureau Admin+", () => {
    useAuthStore.setState({ user: bureauAdmin });
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          commande({
            statut: "expediee",
            lignes: [
              {
                id: "l1",
                variante: "v1",
                quantite: 3,
                prix_unitaire: "20.00",
                sous_total: "60.00",
                quantite_offerte: 0,
                pourcentage_reduction_quantite: null,
                reduction_quantite: "0.00",
                sous_total_net: "60.00",
                quantite_retournee: 1,
                quantite_retournable: 2,
              },
            ],
          }),
        ],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("retour.bouton"));
    expect(screen.getByText("retour.titre")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("retour.quantite_label"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("retour.motif_label"), {
      target: { value: "defectueux" },
    });
    fireEvent.click(screen.getByText("retour.confirmer"));

    expect(creerRetourMock).toHaveBeenCalledWith(
      {
        commande: "c1",
        ligne_commande: "l1",
        quantite: 2,
        motif: "defectueux",
        commentaire: undefined,
      },
      expect.anything(),
    );
  });

  it("ne propose pas de retour quand aucune ligne n'est plus retournable", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          commande({
            statut: "expediee",
            lignes: [
              {
                id: "l1",
                variante: "v1",
                quantite: 2,
                prix_unitaire: "20.00",
                sous_total: "40.00",
                quantite_offerte: 0,
                pourcentage_reduction_quantite: null,
                reduction_quantite: "0.00",
                sous_total_net: "40.00",
                quantite_retournee: 2,
                quantite_retournable: 0,
              },
            ],
          }),
        ],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    expect(screen.queryByText("retour.bouton")).not.toBeInTheDocument();
  });

  it("propose un retour même pour une commande jamais expédiée dans le système (nacherfassung)", () => {
    // Précision du 2026-09-16 : une retoure doit pouvoir être enregistrée indépendamment du
    // statut de la commande (symétrique à expedier nacherfassement), tant que du stock reste
    // retournable sur au moins une ligne.
    useAuthStore.setState({ user: bureauAdmin });
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          commande({
            statut: "en_attente",
            lignes: [
              {
                id: "l1",
                variante: "v1",
                quantite: 10,
                prix_unitaire: "20.00",
                sous_total: "200.00",
                quantite_offerte: 0,
                pourcentage_reduction_quantite: null,
                reduction_quantite: "0.00",
                sous_total_net: "200.00",
                quantite_retournee: 0,
                quantite_retournable: 10,
              },
            ],
          }),
        ],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("retour.bouton"));

    fireEvent.change(screen.getByLabelText("retour.quantite_label"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByText("retour.confirmer"));

    expect(creerRetourMock).toHaveBeenCalledWith(
      {
        commande: "c1",
        ligne_commande: "l1",
        quantite: 5,
        motif: "autre",
        commentaire: undefined,
      },
      expect.anything(),
    );
  });

  it("ne propose pas de retour pour une commande annulée ou remboursée (stock déjà restitué)", () => {
    for (const statut of ["annulee", "remboursee"] as const) {
      vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
        data: {
          next: null,
          previous: null,
          results: [
            commande({
              statut,
              lignes: [
                {
                  id: "l1",
                  variante: "v1",
                  quantite: 2,
                  prix_unitaire: "20.00",
                  sous_total: "40.00",
                  quantite_offerte: 0,
                  pourcentage_reduction_quantite: null,
                  reduction_quantite: "0.00",
                  sous_total_net: "40.00",
                  quantite_retournee: 0,
                  quantite_retournable: 2,
                },
              ],
            }),
          ],
        },
      } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

      const { unmount } = renderWithProviders(<GestionCommandesTab />);
      expect(screen.queryByText("retour.bouton")).not.toBeInTheDocument();
      unmount();
    }
  });
});
