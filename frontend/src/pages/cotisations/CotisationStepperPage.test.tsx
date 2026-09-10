import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
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

  it("enregistre le paiement d'une cotisation et affiche la confirmation", async () => {
    const mutate = vi.fn(
      (_payload, opts?: { onSuccess?: (c: Cotisation) => void }) =>
        opts?.onSuccess?.(cotisation({ reference_transaction: "TXN-2025-XYZ99999" })),
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
    expect(mutate.mock.calls[0][0]).toEqual({
      type_article: "cotisation",
      mode_paiement: "carte",
      statut: "payee",
    });

    await waitFor(() => expect(screen.getByText("confirmation.titre")).toBeInTheDocument());
    expect(screen.getByText("TXN-2025-XYZ99999")).toBeInTheDocument();
  });
});
