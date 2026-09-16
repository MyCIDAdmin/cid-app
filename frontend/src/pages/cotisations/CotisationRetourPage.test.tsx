import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as cotisationsApi from "../../api/cotisations";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import type { Cotisation } from "../../types/cotisation";
import CotisationRetourPage from "./CotisationRetourPage";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useCotisation: vi.fn(),
    useInitierPaiementEnLigne: vi.fn(),
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
    libelle: "Cotisation annuelle 2026",
    montant: "45.00",
    mode_paiement: "carte",
    statut: "en_attente",
    reference_transaction: null,
    annee: 2026,
    saisie_par: null,
    date_paiement: null,
    created_at: "2026-09-11T10:00:00Z",
    updated_at: "2026-09-11T10:00:00Z",
    ...overrides,
  };
}

function renderPage(route = "/cotisation/retour?cotisation=c1") {
  return renderWithProviders(<CotisationRetourPage />, { route, path: "/cotisation/retour" });
}

describe("CotisationRetourPage", () => {
  beforeEach(() => {
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: "" },
    });
    vi.mocked(useCotisationsHooks.useInitierPaiementEnLigne).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useInitierPaiementEnLigne>);
  });

  it("affiche un message d'erreur si aucun identifiant de cotisation n'est fourni", () => {
    vi.mocked(useCotisationsHooks.useCotisation).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisation>);

    renderPage("/cotisation/retour");

    expect(screen.getByText("retour.introuvable")).toBeInTheDocument();
  });

  it("affiche la confirmation pour une cotisation payée et permet de télécharger le reçu", async () => {
    vi.mocked(useCotisationsHooks.useCotisation).mockReturnValue({
      data: cotisation({ statut: "payee", reference_transaction: "STRIPE-pi_1" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisation>);
    const blob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    vi.mocked(cotisationsApi.telechargerRecuCotisation).mockResolvedValue(blob);

    renderPage();

    expect(screen.getByText("retour.titre_payee")).toBeInTheDocument();
    expect(screen.getByText("STRIPE-pi_1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("recu.telecharger"));

    await waitFor(() =>
      expect(cotisationsApi.telechargerRecuCotisation).toHaveBeenCalledWith("c1"),
    );
  });

  it("affiche un message d'échec et permet de réessayer un paiement par carte/paypal", async () => {
    vi.mocked(useCotisationsHooks.useCotisation).mockReturnValue({
      data: cotisation({ statut: "echouee", mode_paiement: "carte" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisation>);
    const mutateInitier = vi.fn(
      (
        _cotisationId,
        opts?: { onSuccess?: (r: { redirect_url: string }) => void },
      ) => opts?.onSuccess?.({ redirect_url: "https://checkout.stripe.com/session/retry" }),
    );
    vi.mocked(useCotisationsHooks.useInitierPaiementEnLigne).mockReturnValue({
      mutate: mutateInitier,
      isPending: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useInitierPaiementEnLigne>);

    renderPage();

    expect(screen.getByText("retour.titre_echouee")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retour.reessayer"));

    expect(mutateInitier).toHaveBeenCalledWith("c1", expect.anything());
    await waitFor(() =>
      expect(window.location.href).toBe("https://checkout.stripe.com/session/retry"),
    );
  });

  it("n'affiche pas de bouton pour réessayer un virement SEPA échoué", () => {
    vi.mocked(useCotisationsHooks.useCotisation).mockReturnValue({
      data: cotisation({ statut: "echouee", mode_paiement: "virement_sepa" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisation>);

    renderPage();

    expect(screen.queryByText("retour.reessayer")).not.toBeInTheDocument();
  });

  it("affiche le message d'annulation quand le membre revient avec annule=1", () => {
    vi.mocked(useCotisationsHooks.useCotisation).mockReturnValue({
      data: cotisation({ statut: "en_attente" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisation>);

    renderPage("/cotisation/retour?cotisation=c1&annule=1");

    expect(screen.getByText("retour.titre_annule")).toBeInTheDocument();
  });

  it("permet de vérifier à nouveau une cotisation encore en attente", () => {
    const refetch = vi.fn();
    vi.mocked(useCotisationsHooks.useCotisation).mockReturnValue({
      data: cotisation({ statut: "en_attente" }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisation>);

    renderPage();

    expect(screen.getByText("retour.titre_attente")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retour.verifier"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
