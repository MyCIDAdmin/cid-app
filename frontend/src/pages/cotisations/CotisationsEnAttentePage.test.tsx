import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useMembresHooks from "../../hooks/useMembres";
import type { Cotisation } from "../../types/cotisation";
import CotisationsEnAttentePage from "./CotisationsEnAttentePage";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useCotisationsGestion: vi.fn(),
    useMarquerCotisationPayee: vi.fn(),
    useChangerStatutCotisation: vi.fn(),
    useHistoriqueStatutsCotisation: vi.fn(),
    useArticlesCatalogue: vi.fn(),
    useEnregistrerPaiementEspeces: vi.fn(),
  };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembre: vi.fn(),
    useMembresList: vi.fn(),
  };
});

/** Derniers filtres transmis à useCotisationsGestion — sert à vérifier onglets/filtres. */
function derniersFiltresTransmis() {
  const appels = vi.mocked(useCotisationsHooks.useCotisationsGestion).mock.calls;
  return appels[appels.length - 1]?.[0];
}

function cotisationEnAttente(overrides: Partial<Cotisation> = {}): Cotisation {
  return {
    id: "c1",
    membre: "m1",
    type_article: "adhesion",
    article_catalogue: null,
    libelle: "Frais d'adhésion",
    montant: "15.00",
    mode_paiement: "",
    statut: "en_attente",
    reference_transaction: null,
    annee: null,
    saisie_par: "m-dg",
    date_paiement: null,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    ...overrides,
  };
}

describe("CotisationsEnAttentePage", () => {
  beforeEach(() => {
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: { id: "m1", prenom: "Riadh", nom: "Bchini", numero_membre: "CA-2026-001" },
      isLoading: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    vi.mocked(useCotisationsHooks.useMarquerCotisationPayee).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useMarquerCotisationPayee>);
    vi.mocked(useCotisationsHooks.useChangerStatutCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useChangerStatutCotisation>);
    vi.mocked(useCotisationsHooks.useHistoriqueStatutsCotisation).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useHistoriqueStatutsCotisation>);
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
    vi.mocked(useCotisationsHooks.useEnregistrerPaiementEspeces).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useEnregistrerPaiementEspeces>);
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
  });

  it("affiche un message quand la file est vide", () => {
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    expect(screen.getByText("en_attente_paiement.aucun")).toBeInTheDocument();
  });

  it("affiche le membre, l'article et le montant", () => {
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [cotisationEnAttente()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    expect(screen.getByText("Riadh Bchini (CA-2026-001)")).toBeInTheDocument();
    expect(screen.getByText("Frais d'adhésion")).toBeInTheDocument();
    expect(screen.getByText("15,00 €")).toBeInTheDocument();
  });

  it("confirme le paiement avec le mode sélectionné", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useMarquerCotisationPayee).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useMarquerCotisationPayee>);
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [cotisationEnAttente()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.change(screen.getByDisplayValue("en_attente_paiement.mode.virement_sepa"), {
      target: { value: "carte" },
    });
    fireEvent.click(screen.getByText("en_attente_paiement.confirmer"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      id: "c1",
      payload: { mode_paiement: "carte" },
    });
  });

  it("préremplit le mode de paiement déjà connu", () => {
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [cotisationEnAttente({ mode_paiement: "paypal" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    expect(screen.getByDisplayValue("en_attente_paiement.mode.paypal")).toBeInTheDocument();
  });

  it("ne propose pas la confirmation rapide pour une cotisation déjà payée", () => {
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [cotisationEnAttente({ statut: "payee" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    expect(screen.queryByText("en_attente_paiement.confirmer")).not.toBeInTheDocument();
    // Mais le contrôle générique de changement de statut, lui, reste disponible.
    expect(screen.getByText("en_attente_paiement.changer_statut")).toBeInTheDocument();
  });

  it("permet de changer le statut vers n'importe quelle valeur avec un motif", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useChangerStatutCotisation).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useChangerStatutCotisation>);
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [cotisationEnAttente({ statut: "payee" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.change(screen.getByLabelText("en_attente_paiement.changer_statut_label"), {
      target: { value: "annulee" },
    });
    fireEvent.change(screen.getByPlaceholderText("en_attente_paiement.motif_placeholder"), {
      target: { value: "Erreur de saisie" },
    });
    fireEvent.click(screen.getByText("en_attente_paiement.changer_statut"));

    expect(mutate).toHaveBeenCalledWith(
      { id: "c1", payload: { statut: "annulee", motif: "Erreur de saisie" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  // --- Onglets + filtres additionnels (ajoutés le 2026-09-21, retour utilisateur : "Status Drop
  // Down Liste als Tabs umwandeln" / "Filter Möglichkeiten hinzufügen") ---

  it("filtre par statut au clic sur un onglet", () => {
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("statut.payee"));

    expect(derniersFiltresTransmis()).toEqual(expect.objectContaining({ statut: "payee" }));
  });

  it("transmet les filtres additionnels (type d'article, mode de paiement, recherche, dates)", () => {
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.change(screen.getByLabelText("en_attente_paiement.filtre_type_article"), {
      target: { value: "adhesion" },
    });
    fireEvent.change(screen.getByLabelText("en_attente_paiement.filtre_mode_paiement"), {
      target: { value: "especes" },
    });
    fireEvent.change(screen.getByLabelText("en_attente_paiement.filtre_recherche"), {
      target: { value: "Trabelsi" },
    });

    expect(derniersFiltresTransmis()).toEqual(
      expect.objectContaining({
        type_article: "adhesion",
        mode_paiement: "especes",
        q: "Trabelsi",
      }),
    );

    expect(screen.getByText("en_attente_paiement.reinitialiser_filtres")).toBeInTheDocument();
    fireEvent.click(screen.getByText("en_attente_paiement.reinitialiser_filtres"));

    expect(derniersFiltresTransmis()).toEqual(
      expect.objectContaining({ type_article: "", mode_paiement: "", q: "" }),
    );
  });

  // --- Paiement en espèces (ajouté le 2026-09-21, retour utilisateur : "Es soll möglich sein
  // eine Zahlung als Barzahlung einzutragen") ---

  it("enregistre un paiement en espèces pour le membre sélectionné", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useEnregistrerPaiementEspeces).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useEnregistrerPaiementEspeces>);
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [{ id: "m9", prenom: "Sami", nom: "Trabelsi", numero_membre: "CA-2026-009" }],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("en_attente_paiement.especes_ouvrir"));
    fireEvent.change(
      screen.getByPlaceholderText("en_attente_paiement.especes_rechercher_membre_placeholder"),
      { target: { value: "Tra" } },
    );
    fireEvent.click(screen.getByText("Sami Trabelsi (CA-2026-009)"));

    fireEvent.click(screen.getByText("en_attente_paiement.especes_soumettre"));

    expect(mutate).toHaveBeenCalledWith(
      {
        membre: "m9",
        type_article: "cotisation",
        mode_paiement: "especes",
        statut: "payee",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("désactive la soumission du paiement en espèces tant qu'aucun membre n'est sélectionné", () => {
    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("en_attente_paiement.especes_ouvrir"));

    expect(screen.getByText("en_attente_paiement.especes_soumettre")).toBeDisabled();
  });

  it("affiche l'historique au clic sur 'Voir l'historique'", () => {
    vi.mocked(useCotisationsHooks.useCotisationsGestion).mockReturnValue({
      data: { next: null, previous: null, results: [cotisationEnAttente({ statut: "payee" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsGestion>);
    vi.mocked(useCotisationsHooks.useHistoriqueStatutsCotisation).mockReturnValue({
      data: [
        {
          id: "h1",
          cotisation: "c1",
          ancien_statut: "en_attente",
          nouveau_statut: "payee",
          motif: "",
          modifie_par: "m-dg",
          modifie_par_nom: "Jean Dupont",
          created_at: "2026-02-01T10:05:00Z",
        },
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useHistoriqueStatutsCotisation>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("en_attente_paiement.voir_historique"));

    expect(screen.getByText(/Jean Dupont/)).toBeInTheDocument();
  });
});
