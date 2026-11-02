import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as boutiqueApi from "../../api/boutique";
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
    useCreerRetourLot: vi.fn(),
    useProduits: vi.fn(),
    useVerwaltungUeberblick: vi.fn(),
  };
});

// Documents PDF (confirmation/facture) et export Excel (demande utilisateur du 2026-09-25,
// module "Shop-Verwaltung") — mockés au niveau du client API, même principe que
// CotisationStepperPage.test.tsx/telechargerRecuCotisation : ces fonctions déclenchent un vrai
// appel réseau (axios) hors du périmètre de ce composant.
vi.mock("../../api/boutique", async () => {
  const actual = await vi.importActual<typeof boutiqueApi>("../../api/boutique");
  return {
    ...actual,
    telechargerConfirmationCommande: vi.fn(),
    telechargerFactureCommande: vi.fn(),
    exporterCommandesExcel: vi.fn(),
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

/** „Mehr“-Menü der ersten Karte öffnen und einen Eintrag wählen. */
function waehleMehr(label: string) {
  fireEvent.click(screen.getByText("bestellung.mehr"));
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
}

function oeffneMehr() {
  fireEvent.click(screen.getByText("bestellung.mehr"));
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

    vi.mocked(useBoutiqueHooks.useVerwaltungUeberblick).mockReturnValue({
      data: {
        stapel: { zahlung_offen: 4, zu_versenden: 3, unterwegs: 2, erledigt: 1, abgebrochen: 0 },
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVerwaltungUeberblick>);
    changerStatutMock = vi.fn();
    annulerMock = vi.fn();
    confirmerPaiementMock = vi.fn();
    expedierMock = vi.fn();
    creerRetourMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          { id: "p1", nom: "Trikot" },
          { id: "p2", nom: "Ticket" },
        ],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

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
    vi.mocked(useBoutiqueHooks.useCreerRetourLot).mockReturnValue({
      mutate: creerRetourMock,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerRetourLot>);

    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
  });

  it("affiche la commande avec son numéro et son montant", () => {
    renderWithProviders(<GestionCommandesTab />);
    expect(screen.getByText("CMD-A1B2C3D4")).toBeInTheDocument();
    expect(screen.getByText("45,00 €")).toBeInTheDocument();
  });

  it("setzt eine bestätigte Bestellung über „Mehr“ in Vorbereitung", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "confirmee" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    waehleMehr("bestellung.in_vorbereitung");
    expect(screen.getByText("bestellung.blatt.vorbereitung.folge")).toBeInTheDocument();
    fireEvent.click(screen.getByText("bestellung.blatt.vorbereitung.knopf"));
    expect(changerStatutMock).toHaveBeenCalledWith(
      { id: "c1", payload: { statut: "en_preparation" } },
      expect.anything(),
    );
  });

  it("markiert eine versandte Bestellung mit dem Hauptknopf als geliefert", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "expediee" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("bestellung.als_geliefert"));
    fireEvent.click(screen.getByText("bestellung.blatt.geliefert.knopf"));
    expect(changerStatutMock).toHaveBeenCalledWith(
      { id: "c1", payload: { statut: "livree" } },
      expect.anything(),
    );
  });

  it("markiert eine versandte Bestellung über „Mehr“ als erstattet (mit Klartext-Folge)", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "expediee" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    waehleMehr("bestellung.erstattet_markieren");
    expect(screen.getByText("bestellung.blatt.erstattet.folge")).toBeInTheDocument();
    fireEvent.click(screen.getByText("bestellung.blatt.erstattet.knopf"));
    expect(changerStatutMock).toHaveBeenCalledWith(
      { id: "c1", payload: { statut: "remboursee" } },
      expect.anything(),
    );
  });

  it("demande confirmation puis annule la commande", () => {
    renderWithProviders(<GestionCommandesTab />);
    waehleMehr("commandes_admin.annuler");
    expect(screen.getByText("commandes_admin.confirmer_annulation_titre")).toBeInTheDocument();

    fireEvent.click(screen.getByText("action.confirmer"));
    expect(annulerMock).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("bietet bei einer gelieferten Bestellung weder Hauptknopf noch Abbrechen an", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "livree" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    expect(screen.queryByText("paiement.confirmer")).not.toBeInTheDocument();
    expect(screen.queryByText("bestellung.als_geliefert")).not.toBeInTheDocument();
    oeffneMehr();
    expect(screen.queryByText("commandes_admin.annuler")).not.toBeInTheDocument();
  });

  it("zeigt Stapel mit ihren Zahlen und filtert nach den zugehörigen Status", () => {
    renderWithProviders(<GestionCommandesTab />);
    expect(screen.getByText("bestellung.stapel.zu_versenden").parentElement).toHaveTextContent("3");
    fireEvent.click(screen.getByText("bestellung.stapel.zu_versenden"));
    expect(vi.mocked(useBoutiqueHooks.useCommandes)).toHaveBeenLastCalledWith(
      expect.objectContaining({ statuts: "confirmee,en_preparation" }),
    );
    fireEvent.click(screen.getByText("commandes_admin.tous"));
    expect(vi.mocked(useBoutiqueHooks.useCommandes)).toHaveBeenLastCalledWith(
      expect.objectContaining({ statuts: undefined }),
    );
  });

  it("startet mit dem vom Überblick gewählten Stapel", () => {
    renderWithProviders(<GestionCommandesTab startStapel="unterwegs" />);
    expect(vi.mocked(useBoutiqueHooks.useCommandes)).toHaveBeenCalledWith(
      expect.objectContaining({ statuts: "expediee" }),
    );
  });

  it("klappt die Details mit Artikeln und Lieferadresse auf", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          commande({
            lignes: [
              {
                id: "l1",
                variante: "v1",
                produit_nom: "Heimtrikot",
                variante_label: "M",
                quantite: 1,
                prix_unitaire: "45.00",
                sous_total: "45.00",
                quantite_offerte: 0,
                pourcentage_reduction_quantite: null,
                reduction_quantite: "0.00",
                sous_total_net: "45.00",
                quantite_retournee: 0,
                quantite_retournable: 1,
              },
            ],
          }),
        ],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);
    renderWithProviders(<GestionCommandesTab />);
    expect(screen.queryByText("Musterstr. 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("bestellung.details"));
    expect(screen.getByText(/Heimtrikot, M/)).toBeInTheDocument();
    expect(screen.getByText("Musterstr. 1")).toBeInTheDocument();
  });

  // --- confirmer_paiement / expedier / retours (Directeur Financier+ pour paiement et
  // expédition, Bureau Admin+ pour les retours — voir le gating de rôle dans le composant) ---

  it("bestätigt die Zahlung über das Blatt mit der gewählten Zahlart (Directeur Financier+)", () => {
    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("paiement.confirmer"));
    expect(screen.getByText("bestellung.blatt.zahlung.folge")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("paiement.mode_label"), {
      target: { value: "especes" },
    });
    fireEvent.click(screen.getByText("bestellung.blatt.zahlung.knopf"));
    expect(confirmerPaiementMock).toHaveBeenCalledWith(
      { id: "c1", payload: { mode_paiement: "especes", date_paiement: undefined } },
      expect.anything(),
    );
  });

  it("bestätigt die Zahlung mit rückdatiertem Transaktionsdatum (Wunsch vom 29.09.2026)", () => {
    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("paiement.confirmer"));
    fireEvent.change(screen.getByLabelText("paiement.mode_label"), {
      target: { value: "especes" },
    });
    fireEvent.change(screen.getByLabelText("paiement.date_paiement_label"), {
      target: { value: "2026-06-10" },
    });
    fireEvent.click(screen.getByText("bestellung.blatt.zahlung.knopf"));
    expect(confirmerPaiementMock).toHaveBeenCalledWith(
      { id: "c1", payload: { mode_paiement: "especes", date_paiement: "2026-06-10" } },
      expect.anything(),
    );
  });

  it("sperrt Zahlung und Versand unterhalb von Directeur Financier und sagt, wer es darf", () => {
    useAuthStore.setState({ user: bureauAdmin });
    renderWithProviders(<GestionCommandesTab />);
    expect(screen.getByText("paiement.confirmer")).toBeDisabled();
    expect(screen.getByText("bestellung.nur_finanz")).toBeInTheDocument();
    oeffneMehr();
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
    waehleMehr("nacherfassung.bouton");
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
    waehleMehr("retour.bouton");
    expect(screen.getByText("retour.titre")).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText("retour.quantite_label")[0], {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("retour.motif_label"), {
      target: { value: "defectueux" },
    });
    fireEvent.click(screen.getByText("retour.confirmer"));

    expect(creerRetourMock).toHaveBeenCalledWith(
      {
        commande: "c1",
        motif: "defectueux",
        commentaire: undefined,
        lignes: [{ ligne_commande: "l1", quantite: 2 }],
      },
      expect.anything(),
    );
  });

  it("propose un retour sur plusieurs variantes en un seul lot", () => {
    // Demande utilisateur du 2026-09-29 : "Bei Shop Verwaltung für Retoure soll es möglich
    // sein, Mengen pro Varianten einzugeben" — deux lignes retournables de la même commande,
    // chacune avec sa propre quantité saisie, soumises en un seul appel à /retours/lot/.
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
                quantite_retournee: 0,
                quantite_retournable: 3,
              },
              {
                id: "l2",
                variante: "v2",
                quantite: 2,
                prix_unitaire: "15.00",
                sous_total: "30.00",
                quantite_offerte: 0,
                pourcentage_reduction_quantite: null,
                reduction_quantite: "0.00",
                sous_total_net: "30.00",
                quantite_retournee: 0,
                quantite_retournable: 2,
              },
            ],
          }),
        ],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab />);
    waehleMehr("retour.bouton");

    const inputs = screen.getAllByLabelText("retour.quantite_label");
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: "2" } });
    fireEvent.change(inputs[1], { target: { value: "1" } });
    fireEvent.click(screen.getByText("retour.confirmer"));

    expect(creerRetourMock).toHaveBeenCalledWith(
      {
        commande: "c1",
        motif: "autre",
        commentaire: undefined,
        lignes: [
          { ligne_commande: "l1", quantite: 2 },
          { ligne_commande: "l2", quantite: 1 },
        ],
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
    oeffneMehr();
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
    waehleMehr("retour.bouton");

    fireEvent.change(screen.getAllByLabelText("retour.quantite_label")[0], {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByText("retour.confirmer"));

    expect(creerRetourMock).toHaveBeenCalledWith(
      {
        commande: "c1",
        motif: "autre",
        commentaire: undefined,
        lignes: [{ ligne_commande: "l1", quantite: 5 }],
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
      oeffneMehr();
      expect(screen.queryByText("retour.bouton")).not.toBeInTheDocument();
      unmount();
    }
  });

  // Bug remonté par l'utilisateur (2026-09-24, task #216) — voir GestionCatalogueTab.test.tsx.
  it("sperrt im Lesemodus die Änderungen und ruft nie die Statusänderung auf", () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: { next: null, previous: null, results: [commande({ statut: "expediee" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);

    renderWithProviders(<GestionCommandesTab modifiable={false} />);
    expect(screen.getByText("bestellung.als_geliefert")).toBeDisabled();
    oeffneMehr();
    expect(screen.getByRole("menuitem", { name: "bestellung.erstattet_markieren" })).toBeDisabled();
    expect(changerStatutMock).not.toHaveBeenCalled();
  });

  // --- Documents PDF (confirmation/facture) et export Excel, filtres destinataire/dates
  // (demande utilisateur du 2026-09-25, module "Shop-Verwaltung") ---

  it("télécharge la confirmation de commande", async () => {
    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    vi.mocked(boutiqueApi.telechargerConfirmationCommande).mockResolvedValue(blob);

    renderWithProviders(<GestionCommandesTab />);
    waehleMehr("bestellung.pdf_bestaetigung");

    await waitFor(() =>
      expect(boutiqueApi.telechargerConfirmationCommande).toHaveBeenCalledWith("c1"),
    );
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it("propose le téléchargement de la facture uniquement si le paiement est confirmé", () => {
    renderWithProviders(<GestionCommandesTab />);
    // commande() par défaut : date_paiement_confirme=null.
    oeffneMehr();
    expect(screen.queryByText("bestellung.pdf_rechnung")).not.toBeInTheDocument();
  });

  it("télécharge la facture quand le paiement est confirmé", async () => {
    vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [commande({ date_paiement_confirme: "2026-01-02T10:00:00Z" })],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);
    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    vi.mocked(boutiqueApi.telechargerFactureCommande).mockResolvedValue(blob);

    renderWithProviders(<GestionCommandesTab />);
    waehleMehr("bestellung.pdf_rechnung");

    await waitFor(() => expect(boutiqueApi.telechargerFactureCommande).toHaveBeenCalledWith("c1"));
  });

  it("filtre les commandes par destinataire et intervalle de dates", () => {
    renderWithProviders(<GestionCommandesTab />);

    fireEvent.change(screen.getByLabelText("bestellung.suche_label"), {
      target: { value: "Bchini" },
    });
    fireEvent.change(screen.getByLabelText("commandes_admin.filtre_date_apres_label"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("commandes_admin.filtre_date_avant_label"), {
      target: { value: "2026-01-31" },
    });

    expect(vi.mocked(useBoutiqueHooks.useCommandes)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        destinataire: "Bchini",
        date_apres: "2026-01-01",
        date_avant: "2026-01-31",
      }),
    );
  });

  it("exporte les commandes filtrées en Excel", async () => {
    const blob = new Blob(["xlsx"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    vi.mocked(boutiqueApi.exporterCommandesExcel).mockResolvedValue({
      blob,
      nomFichier: "export_commandes_202601011200.xlsx",
    });

    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByText("commandes_admin.exporter_excel"));

    await waitFor(() => expect(boutiqueApi.exporterCommandesExcel).toHaveBeenCalled());
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it("exportiert nur die gewählten Artikel (Release 6)", async () => {
    vi.mocked(boutiqueApi.exporterCommandesExcel).mockResolvedValue({
      blob: new Blob(["x"]),
      nomFichier: "export.xlsx",
    });
    renderWithProviders(<GestionCommandesTab />);
    fireEvent.click(screen.getByLabelText("Trikot"));
    fireEvent.click(screen.getByLabelText("Ticket"));
    fireEvent.click(screen.getByText("commandes_admin.exporter_excel"));
    await waitFor(() =>
      expect(boutiqueApi.exporterCommandesExcel).toHaveBeenCalledWith(
        expect.objectContaining({ produit: "p1,p2" }),
      ),
    );
  });
});
