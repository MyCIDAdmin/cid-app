import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useEvenementsHooks from "../../hooks/useEvenements";
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

// Ajouté le 2026-09-21 (retour utilisateur : ajout du type d'article "evenement" au formulaire
// de saisie en espèces, voir PaiementEspecesForm) — useEvenements/useInscrireEspeces sont de
// vrais hooks React Query, sans quoi ils tenteraient un appel réseau réel dans ces tests.
vi.mock("../../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../../hooks/useEvenements");
  return {
    ...actual,
    useEvenements: vi.fn(),
    useInscrireEspeces: vi.fn(),
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
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);
    vi.mocked(useEvenementsHooks.useInscrireEspeces).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscrireEspeces>);
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

  // --- Retour utilisateur du 2026-09-21, 3 demandes sur ce formulaire ---

  it("affiche un message d'état vide sous le menu 'Shop-Artikel' quand aucun article personnalisé actif n'existe", () => {
    // useArticlesCatalogue renvoie déjà data: { results: [] } via le beforeEach — reproduit le
    // cas signalé ("keine Artikel werden angezeigt") : le menu ne doit plus rester silencieux,
    // voir docstring de PaiementEspecesForm.
    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("en_attente_paiement.especes_ouvrir"));
    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_type_article"), {
      target: { value: "autre" },
    });

    expect(screen.getByText("en_attente_paiement.especes_shop_aucun")).toBeInTheDocument();
  });

  it("filtre les articles personnalisés désactivés du menu 'Shop-Artikel'", () => {
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          {
            id: "a1",
            libelle: "T-shirt du club",
            montant: "20.00",
            actif: true,
            type_fixe: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "a2",
            libelle: "Écharpe (retirée)",
            montant: "10.00",
            actif: false,
            type_fixe: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("en_attente_paiement.especes_ouvrir"));
    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_type_article"), {
      target: { value: "autre" },
    });

    expect(screen.getByText(/T-shirt du club/)).toBeInTheDocument();
    expect(screen.queryByText(/Écharpe \(retirée\)/)).not.toBeInTheDocument();
  });

  it("inscrit un membre à un évènement actif et payant avec paiement cash immédiat", () => {
    const mutate = vi.fn();
    vi.mocked(useEvenementsHooks.useInscrireEspeces).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscrireEspeces>);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          {
            id: "ev1",
            titre: "Sortie à Dortmund",
            date_evenement: "2026-11-01",
            heure: null,
            lieu: "Dortmund",
            cout: "25.00",
            gratuit: false,
            statut: "publie",
          },
          {
            id: "ev2",
            titre: "AG annuelle",
            date_evenement: "2026-12-01",
            heure: null,
            lieu: "Berlin",
            cout: "0.00",
            gratuit: true,
            statut: "publie",
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [{ id: "m9", prenom: "Sami", nom: "Trabelsi", numero_membre: "CA-2026-009" }],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("en_attente_paiement.especes_ouvrir"));
    fireEvent.change(
      screen.getByPlaceholderText("en_attente_paiement.especes_rechercher_membre_placeholder"),
      { target: { value: "Tra" } },
    );
    fireEvent.click(screen.getByText("Sami Trabelsi (CA-2026-009)"));

    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_type_article"), {
      target: { value: "evenement" },
    });

    // L'évènement gratuit n'a rien à confirmer côté paiement, voir docstring de module — seul
    // l'évènement payant est proposé.
    expect(screen.queryByText(/AG annuelle/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_evenement"), {
      target: { value: "ev1" },
    });
    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_places"), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByText("en_attente_paiement.especes_soumettre"));

    expect(mutate).toHaveBeenCalledWith(
      { membre: "m9", evenement: "ev1", places: 2 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("enregistre un paiement en espèces de type 'autre_libre' avec libellé et montant saisis", () => {
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

    renderWithProviders(<CotisationsEnAttentePage />);

    fireEvent.click(screen.getByText("en_attente_paiement.especes_ouvrir"));
    fireEvent.change(
      screen.getByPlaceholderText("en_attente_paiement.especes_rechercher_membre_placeholder"),
      { target: { value: "Tra" } },
    );
    fireEvent.click(screen.getByText("Sami Trabelsi (CA-2026-009)"));

    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_type_article"), {
      target: { value: "autre_libre" },
    });

    // Contrairement à "don", le libellé n'a pas de valeur par défaut : la soumission reste
    // désactivée tant qu'il n'est pas saisi.
    expect(screen.getByText("en_attente_paiement.especes_soumettre")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_montant"), {
      target: { value: "12.50" },
    });
    fireEvent.change(screen.getByLabelText("en_attente_paiement.especes_champ_libelle"), {
      target: { value: "Remboursement frais essence" },
    });

    fireEvent.click(screen.getByText("en_attente_paiement.especes_soumettre"));

    expect(mutate).toHaveBeenCalledWith(
      {
        membre: "m9",
        type_article: "autre_libre",
        mode_paiement: "especes",
        statut: "payee",
        montant: "12.50",
        libelle: "Remboursement frais essence",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
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
