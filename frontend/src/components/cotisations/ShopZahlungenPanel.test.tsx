import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useBoutiqueHooks from "../../hooks/useBoutique";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import { heuteIso } from "../../utils/datum";
import ShopZahlungenPanel from "./ShopZahlungenPanel";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useCommandes: vi.fn(), useConfirmerPaiementCommande: vi.fn() };
});

const dirFinancier = {
  id: "u3",
  email: "dg@example.com",
  role: "dir_financier" as const,
  langue_preferee: "fr" as const,
};

function commande(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    numero_commande: "CMD-001",
    nom_destinataire: "Max Mustermann",
    montant_total: "25.00",
    statut: "en_attente",
    mode_paiement: "",
    date_paiement_confirme: null,
    ...overrides,
  };
}

function mockCommandes(results: unknown[], mutate = vi.fn()) {
  vi.mocked(useBoutiqueHooks.useCommandes).mockReturnValue({
    data: { count: results.length, next: null, previous: null, results },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useBoutiqueHooks.useCommandes>);
  vi.mocked(useBoutiqueHooks.useConfirmerPaiementCommande).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useBoutiqueHooks.useConfirmerPaiementCommande>);
  return mutate;
}

describe("ShopZahlungenPanel", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: dirFinancier,
      isAuthenticated: true,
    });
  });

  it("bestätigt die Zahlung standardmäßig mit dem heutigen Transaktionsdatum", () => {
    const mutate = mockCommandes([commande()]);
    renderWithProviders(<ShopZahlungenPanel />);

    const datum = screen.getByLabelText("shop_zahlungen.transaktionsdatum");
    expect(datum).toHaveValue(heuteIso());

    fireEvent.click(screen.getByText("shop_zahlungen.confirmer"));

    expect(mutate.mock.calls[0][0]).toEqual({
      id: "o1",
      payload: { mode_paiement: "virement", date_paiement: heuteIso() },
    });
  });

  it("übernimmt ein manuell gesetztes Transaktionsdatum", () => {
    const mutate = mockCommandes([commande()]);
    renderWithProviders(<ShopZahlungenPanel />);

    fireEvent.change(screen.getByLabelText("shop_zahlungen.transaktionsdatum"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(screen.getByText("shop_zahlungen.confirmer"));

    expect(mutate.mock.calls[0][0].payload.date_paiement).toBe("2026-09-01");
  });

  it("zeigt das Transaktionsdatum bereits bestätigter Bestellungen", () => {
    mockCommandes([
      commande({
        statut: "confirmee",
        mode_paiement: "virement",
        date_paiement_confirme: "2026-09-01T10:00:00Z",
      }),
    ]);
    renderWithProviders(<ShopZahlungenPanel />);

    expect(
      screen.getByText(new RegExp(new Date("2026-09-01T10:00:00Z").toLocaleDateString())),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("shop_zahlungen.transaktionsdatum")).not.toBeInTheDocument();
  });
});
