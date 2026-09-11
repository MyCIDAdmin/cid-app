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
    useCotisationsEnAttenteDePaiement: vi.fn(),
    useMarquerCotisationPayee: vi.fn(),
  };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembre: vi.fn(),
  };
});

function cotisationEnAttente(overrides: Partial<Cotisation> = {}): Cotisation {
  return {
    id: "c1",
    membre: "m1",
    type_article: "adhesion",
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
  });

  it("affiche un message quand la file est vide", () => {
    vi.mocked(useCotisationsHooks.useCotisationsEnAttenteDePaiement).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsEnAttenteDePaiement>);

    renderWithProviders(<CotisationsEnAttentePage />);

    expect(screen.getByText("en_attente_paiement.aucun")).toBeInTheDocument();
  });

  it("affiche le membre, l'article et le montant", () => {
    vi.mocked(useCotisationsHooks.useCotisationsEnAttenteDePaiement).mockReturnValue({
      data: { next: null, previous: null, results: [cotisationEnAttente()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsEnAttenteDePaiement>);

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
    vi.mocked(useCotisationsHooks.useCotisationsEnAttenteDePaiement).mockReturnValue({
      data: { next: null, previous: null, results: [cotisationEnAttente()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsEnAttenteDePaiement>);

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
    vi.mocked(useCotisationsHooks.useCotisationsEnAttenteDePaiement).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [cotisationEnAttente({ mode_paiement: "paypal" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisationsEnAttenteDePaiement>);

    renderWithProviders(<CotisationsEnAttentePage />);

    expect(screen.getByDisplayValue("en_attente_paiement.mode.paypal")).toBeInTheDocument();
  });
});
