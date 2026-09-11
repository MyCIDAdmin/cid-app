import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as cotisationsApi from "../../api/cotisations";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import type { Cotisation } from "../../types/cotisation";
import CotisationStepperPage from "./CotisationStepperPage";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useMesCotisations: vi.fn(),
    useCreerCotisation: vi.fn(),
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

    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
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
});
