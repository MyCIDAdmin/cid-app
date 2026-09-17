import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as cotisationsApi from "../../api/cotisations";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import type { ArticleCatalogue, Cotisation } from "../../types/cotisation";
import CotisationStepperPage from "./CotisationStepperPage";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useMesCotisations: vi.fn(),
    useCreerCotisation: vi.fn(),
    useInitierPaiementEnLigne: vi.fn(),
    useArticlesCatalogue: vi.fn(),
  };
});

vi.mock("../../api/cotisations", async () => {
  const actual = await vi.importActual<typeof cotisationsApi>("../../api/cotisations");
  return {
    ...actual,
    telechargerRecuCotisation: vi.fn(),
  };
});

function cotisation(overrides: Partial<Cotisation> = {}): Cotisation {
  return {
    id: "c1",
    membre: "m1",
    type_article: "cotisation",
    article_catalogue: null,
    libelle: "Cotisation annuelle 2025",
    montant: "45.00",
    mode_paiement: "carte",
    statut: "payee",
    reference_transaction: "TXN-2025-ABCD1234",
    annee: 2025,
    saisie_par: null,
    date_paiement: "2025-01-10T10:00:00Z",
    created_at: "2025-01-10T10:00:00Z",
    updated_at: "2025-01-10T10:00:00Z",
    ...overrides,
  };
}

describe("CotisationStepperPage", () => {
  beforeEach(() => {
    vi.mocked(useCotisationsHooks.useMesCotisations).mockReturnValue({
      data: { next: null, previous: null, results: [cotisation()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useMesCotisations>);

    // Défaut réaliste (2026-09-17, suite au passage fail-closed des cartes cotisation/adhésion,
    // voir docstring de module) : les 2 lignes type_fixe actives, comme après la migration 0006
    // en usage normal — sans elles, plus aucune carte cotisation/adhésion ne s'afficherait, ce qui
    // casserait tous les tests non liés au catalogue. Pas d'article personnalisé par défaut ; les
    // tests qui exercent spécifiquement le flux "autre" ou la désactivation redéfinissent `data`.
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          articleFixe(),
          articleFixe({ id: "art-fixe-adhesion", type_fixe: "adhesion", montant: "15.00" }),
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();

    // Défaut neutre (no-op) : les tests qui n'exercent pas explicitement la passerelle AHM-46
    // n'ont pas besoin d'un vrai appel réseau (non mocké côté api/cotisations.ts) juste pour ne
    // pas planter au rendu de l'étape 3.
    vi.mocked(useCotisationsHooks.useInitierPaiementEnLigne).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useInitierPaiementEnLigne>);

    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: "" },
    });
  });

  it("affiche l'étape 1 avec la cotisation sélectionnée par défaut", () => {
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    expect(screen.getByText("continuer")).toBeInTheDocument();
    // Récapitulatif + option catalogue + historique affichent tous 45,00 €.
    expect(screen.getAllByText("45,00 €").length).toBeGreaterThanOrEqual(2);
    // Historique affiché sous l'étape 1.
    expect(screen.getByText("Cotisation annuelle 2025")).toBeInTheDocument();
  });

  it("refuse de continuer pour un don sans montant valide", () => {
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    fireEvent.click(screen.getByText("article.don_titre"));
    const champMontant = screen.getByLabelText("article.don_montant_label") as HTMLInputElement;
    fireEvent.change(champMontant, { target: { value: "0" } });

    fireEvent.click(screen.getByText("continuer"));

    expect(screen.getByText("article.don_montant_erreur")).toBeInTheDocument();
  });

  it("enregistre le paiement d'une cotisation et affiche la confirmation en attente (AHM-53)", async () => {
    // AHM-53 : le serveur ne renvoie jamais statut=payee pour un paiement en libre-service, quel
    // que soit le mode choisi — voir docstring de CotisationStepperPage et perform_create côté
    // backend. Le mock reflète donc la réalité de l'API : en_attente, pas de référence.
    const mutate = vi.fn(
      (_payload, opts?: { onSuccess?: (c: Cotisation) => void }) =>
        opts?.onSuccess?.(
          cotisation({ statut: "en_attente", reference_transaction: null, date_paiement: null }),
        ),
    );
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    fireEvent.click(screen.getByText("continuer"));
    expect(screen.getByText("paiement.titre")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/paiement\.payer/));

    expect(mutate).toHaveBeenCalledTimes(1);
    // Pas de champ `statut` envoyé : le serveur l'impose toujours lui-même (AHM-53).
    expect(mutate.mock.calls[0][0]).toEqual({
      type_article: "cotisation",
      mode_paiement: "carte",
    });

    await waitFor(() =>
      expect(screen.getByText("confirmation.titre_attente")).toBeInTheDocument(),
    );
    // Pas de référence de transaction ni de bouton de reçu tant que ce n'est pas confirmé.
    expect(screen.queryByText(/TXN-/)).not.toBeInTheDocument();
    expect(screen.queryByText("recu.telecharger")).not.toBeInTheDocument();
  });

  it("redirige vers la passerelle de paiement pour un règlement par carte (AHM-46)", async () => {
    const mutateCreer = vi.fn(
      (_payload, opts?: { onSuccess?: (c: Cotisation) => void }) =>
        opts?.onSuccess?.(
          cotisation({ id: "c-carte", statut: "en_attente", reference_transaction: null }),
        ),
    );
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: mutateCreer,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    const mutateInitier = vi.fn(
      (
        _cotisationId,
        opts?: { onSuccess?: (r: { redirect_url: string }) => void },
      ) => opts?.onSuccess?.({ redirect_url: "https://checkout.stripe.com/session/abc" }),
    );
    vi.mocked(useCotisationsHooks.useInitierPaiementEnLigne).mockReturnValue({
      mutate: mutateInitier,
      isPending: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useInitierPaiementEnLigne>);

    renderWithProviders(<CotisationStepperPage />);

    fireEvent.click(screen.getByText("continuer"));
    fireEvent.click(screen.getByText(/paiement\.payer/));

    await waitFor(() => expect(mutateInitier).toHaveBeenCalledWith("c-carte", expect.anything()));
    expect(window.location.href).toBe("https://checkout.stripe.com/session/abc");
  });

  it("affiche une erreur et un bouton pour réessayer si l'initiation du paiement en ligne échoue (AHM-46)", async () => {
    const mutateCreer = vi.fn(
      (_payload, opts?: { onSuccess?: (c: Cotisation) => void }) =>
        opts?.onSuccess?.(
          cotisation({ id: "c-paypal", statut: "en_attente", mode_paiement: "paypal" }),
        ),
    );
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: mutateCreer,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    const mutateInitier = vi.fn(
      (_cotisationId, opts?: { onError?: (e: unknown) => void }) =>
        opts?.onError?.(new Error("boom")),
    );
    vi.mocked(useCotisationsHooks.useInitierPaiementEnLigne).mockReturnValue({
      mutate: mutateInitier,
      isPending: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useInitierPaiementEnLigne>);

    renderWithProviders(<CotisationStepperPage />);

    fireEvent.click(screen.getByText("continuer"));
    // Choisir PayPal explicitement (le mode par défaut est carte).
    fireEvent.click(screen.getByText("paiement.paypal_titre"));
    fireEvent.click(screen.getByText(/paiement\.payer/));

    await waitFor(() =>
      expect(screen.getByText("paiement.erreur_gateway")).toBeInTheDocument(),
    );
    expect(window.location.href).toBe("");

    mutateInitier.mockClear();
    fireEvent.click(screen.getByText("paiement.reessayer_gateway"));
    expect(mutateInitier).toHaveBeenCalledWith("c-paypal", expect.anything());
  });

  it("n'appelle jamais la passerelle pour un virement SEPA (AHM-46)", async () => {
    const mutateCreer = vi.fn(
      (_payload, opts?: { onSuccess?: (c: Cotisation) => void }) =>
        opts?.onSuccess?.(
          cotisation({ statut: "en_attente", mode_paiement: "virement_sepa" }),
        ),
    );
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: mutateCreer,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);
    const mutateInitier = vi.fn();
    vi.mocked(useCotisationsHooks.useInitierPaiementEnLigne).mockReturnValue({
      mutate: mutateInitier,
      isPending: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useInitierPaiementEnLigne>);

    renderWithProviders(<CotisationStepperPage />);

    fireEvent.click(screen.getByText("continuer"));
    fireEvent.click(screen.getByText("paiement.sepa_titre"));
    fireEvent.click(screen.getByText(/paiement\.payer/));

    await waitFor(() =>
      expect(screen.getByText("confirmation.titre_attente")).toBeInTheDocument(),
    );
    expect(mutateInitier).not.toHaveBeenCalled();
  });

  it("télécharge le reçu depuis l'historique pour une ligne payée (AHM-17)", async () => {
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);
    const blob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    vi.mocked(cotisationsApi.telechargerRecuCotisation).mockResolvedValue(blob);

    renderWithProviders(<CotisationStepperPage />);

    fireEvent.click(screen.getByText("recu.telecharger"));

    await waitFor(() =>
      expect(cotisationsApi.telechargerRecuCotisation).toHaveBeenCalledWith("c1"),
    );
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("n'affiche pas le bouton de reçu pour une cotisation non payée", () => {
    vi.mocked(useCotisationsHooks.useMesCotisations).mockReturnValue({
      data: { next: null, previous: null, results: [cotisation({ statut: "en_attente" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useMesCotisations>);
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    expect(screen.queryByText("recu.telecharger")).not.toBeInTheDocument();
  });

  it("propose le téléchargement du reçu si la confirmation renvoie déjà un paiement payé", async () => {
    // Cas défensif : si le serveur renvoyait un jour statut=payee dès la création (ex. saisie
    // DF pour un autre membre, F-015 — hors scope du stepper libre-service mais même type de
    // réponse), l'écran de confirmation doit quand même proposer le reçu immédiatement.
    const mutate = vi.fn(
      (_payload, opts?: { onSuccess?: (c: Cotisation) => void }) =>
        opts?.onSuccess?.(cotisation({ id: "c-nouveau", reference_transaction: "TXN-2025-XYZ99999" })),
    );
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);
    const blob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    vi.mocked(cotisationsApi.telechargerRecuCotisation).mockResolvedValue(blob);

    renderWithProviders(<CotisationStepperPage />);

    fireEvent.click(screen.getByText("continuer"));
    fireEvent.click(screen.getByText(/paiement\.payer/));
    await waitFor(() => expect(screen.getByText("confirmation.titre")).toBeInTheDocument());

    fireEvent.click(screen.getByText("recu.telecharger"));

    await waitFor(() =>
      expect(cotisationsApi.telechargerRecuCotisation).toHaveBeenCalledWith("c-nouveau"),
    );
  });

  // Retour utilisateur du 2026-09-17 : catalogue d'articles supplémentaires géré par
  // l'Administrateur App (voir apps.cotisations.models.ArticleCatalogue), proposé ici en plus des
  // 3 choix fixes existants.
  it("propose les articles actifs du catalogue et envoie article_catalogue pour le type autre", () => {
    function articleCatalogue(overrides: Partial<ArticleCatalogue> = {}): ArticleCatalogue {
      return {
        id: "art-1",
        libelle: "T-shirt du club",
        montant: "20.00",
        actif: true,
        type_fixe: null,
        created_at: "2026-09-17T10:00:00Z",
        updated_at: "2026-09-17T10:00:00Z",
        ...overrides,
      };
    }

    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [articleCatalogue(), articleCatalogue({ id: "art-2", actif: false, libelle: "Ancien article" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);

    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    // L'article désactivé n'est jamais proposé.
    expect(screen.queryByText("Ancien article")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("T-shirt du club"));
    fireEvent.click(screen.getByText("continuer"));
    fireEvent.click(screen.getByText(/paiement\.payer/));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      type_article: "autre",
      mode_paiement: "carte",
      article_catalogue: "art-1",
    });
  });

  // Retour utilisateur du 2026-09-17 : "die bestehende [Cotisation annuelle/Frais d'adhésion]
  // müssen auch verwaltbar sein" — les 2 cartes fixes sont désormais pilotées par
  // ArticleCatalogue.type_fixe (voir docstring de module).
  function articleFixe(overrides: Partial<ArticleCatalogue> = {}): ArticleCatalogue {
    return {
      id: "art-fixe-cotisation",
      libelle: "Cotisation annuelle",
      montant: "45.00",
      actif: true,
      type_fixe: "cotisation",
      created_at: "2026-09-17T10:00:00Z",
      updated_at: "2026-09-17T10:00:00Z",
      ...overrides,
    };
  }

  it("affiche le tarif de cotisation configuré par l'Administrateur App plutôt que la valeur de repli", () => {
    // Historique vidé pour ce test : la cotisation de test par défaut (montant 45.00, voir
    // fonction cotisation() en tête de fichier) afficherait sinon aussi "45,00 €", sans rapport
    // avec le tarif catalogue vérifié ici.
    vi.mocked(useCotisationsHooks.useMesCotisations).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useMesCotisations>);
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [articleFixe({ montant: "60.00" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    expect(screen.getAllByText("60,00 €").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("45,00 €")).not.toBeInTheDocument();
  });

  it("masque la carte cotisation quand ce tarif est désactivé par l'Administrateur App", () => {
    // Les 2 lignes type_fixe sont présentes (comme en usage normal après la migration 0006) —
    // seule cotisation est désactivée, adhésion reste active : la ligne adhésion doit donc être
    // incluse dans la réponse mockée pour que sa carte reste visible (fail-closed depuis le
    // 2026-09-17 : une ligne absente masque désormais la carte, voir docstring de module).
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          articleFixe({ actif: false }),
          articleFixe({ id: "art-fixe-adhesion", type_fixe: "adhesion", montant: "15.00" }),
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    expect(screen.queryByText("article.cotisation_description")).not.toBeInTheDocument();
    // La carte adhésion (non désactivée) reste proposée.
    expect(screen.getByText("article.adhesion_description")).toBeInTheDocument();
  });

  it("continue d'afficher les cartes cotisation/adhesion tant que le catalogue n'est pas encore chargé", () => {
    // Fail-open UNIQUEMENT pendant le chargement (évite un flash "absent puis présent") — une
    // fois la réponse là, voir le test suivant pour le comportement fail-closed.
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    expect(screen.getByText("article.cotisation_description")).toBeInTheDocument();
    expect(screen.getByText("article.adhesion_description")).toBeInTheDocument();
  });

  it("masque les cartes cotisation/adhesion quand leur ligne type_fixe a été supprimée (pas seulement désactivée)", () => {
    // Corrigé le 2026-09-17 (retour utilisateur répété : "Die Artikel müssen komplett gelöscht
    // werden") — avant ce correctif, une ligne SUPPRIMÉE (au lieu de désactivée, ex. via Django
    // Admin) était traitée comme "pas encore chargée" et la carte réapparaissait au tarif de
    // repli MONTANTS_CATALOGUE. La réponse catalogue est chargée mais ne contient aucune ligne
    // type_fixe : symétrique au test ci-dessus (chargement en cours), qui lui reste fail-open.
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);

    renderWithProviders(<CotisationStepperPage />);

    expect(screen.queryByText("article.cotisation_description")).not.toBeInTheDocument();
    expect(screen.queryByText("article.adhesion_description")).not.toBeInTheDocument();
    expect(screen.getByText("article.don_description")).toBeInTheDocument();
  });
});
