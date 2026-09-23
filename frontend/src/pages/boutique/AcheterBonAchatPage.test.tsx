import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { BonAchat } from "../../types/boutique";
import AcheterBonAchatPage from "./AcheterBonAchatPage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useAcheterBonAchat: vi.fn() };
});

function bonAchat(overrides: Partial<BonAchat> = {}): BonAchat {
  return {
    id: "b1",
    code: "BON-A1B2C3D4",
    montant_initial: "80.00",
    solde: "80.00",
    statut: "en_attente",
    achete_par: "m1",
    mode_paiement: "",
    date_paiement_confirme: null,
    paiement_confirme_par: null,
    reference_paiement: "",
    date_expiration: null,
    utilisable: false,
    est_expire: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("AcheterBonAchatPage", () => {
  let acheterMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    acheterMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useAcheterBonAchat).mockReturnValue({
      mutate: acheterMock,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAcheterBonAchat>);
  });

  it("affiche le formulaire avec le montant par défaut", () => {
    renderWithProviders(<AcheterBonAchatPage />);
    expect(screen.getByLabelText(/bon_achat_acheter.montant_label/)).toHaveValue(25);
  });

  it("met à jour le montant au clic sur une suggestion", () => {
    renderWithProviders(<AcheterBonAchatPage />);
    fireEvent.click(screen.getByText("50,00 €"));
    expect(screen.getByLabelText(/bon_achat_acheter.montant_label/)).toHaveValue(50);
  });

  it("soumet l'achat avec le montant saisi", () => {
    renderWithProviders(<AcheterBonAchatPage />);
    fireEvent.change(screen.getByLabelText(/bon_achat_acheter.montant_label/), {
      target: { value: "80.00" },
    });
    fireEvent.click(screen.getByText("bon_achat_acheter.acheter"));

    expect(acheterMock).toHaveBeenCalledWith({ montant: "80.00" }, expect.anything());
  });

  it("affiche l'écran de confirmation après un achat réussi", () => {
    acheterMock.mockImplementation((_payload, { onSuccess }) => {
      onSuccess(bonAchat());
    });
    renderWithProviders(<AcheterBonAchatPage />);
    fireEvent.change(screen.getByLabelText(/bon_achat_acheter.montant_label/), {
      target: { value: "80.00" },
    });
    fireEvent.click(screen.getByText("bon_achat_acheter.acheter"));

    expect(screen.getByText("bon_achat_acheter.confirme_titre")).toBeInTheDocument();
    expect(screen.getByText("paiement_instructions.virement_titre")).toBeInTheDocument();
    expect(screen.getByText("paiement_instructions.paypal_titre")).toBeInTheDocument();
  });

  it("désactive le bouton d'achat quand le montant est hors bornes", () => {
    renderWithProviders(<AcheterBonAchatPage />);
    const champMontant = screen.getByLabelText(/bon_achat_acheter.montant_label/);

    fireEvent.change(champMontant, { target: { value: "1000" } });
    expect(screen.getByText("bon_achat_acheter.acheter")).toBeDisabled();

    fireEvent.change(champMontant, { target: { value: "1" } });
    expect(screen.getByText("bon_achat_acheter.acheter")).toBeDisabled();

    fireEvent.change(champMontant, { target: { value: "80" } });
    expect(screen.getByText("bon_achat_acheter.acheter")).not.toBeDisabled();
  });

  it("affiche une erreur si l'achat échoue", () => {
    vi.mocked(useBoutiqueHooks.useAcheterBonAchat).mockReturnValue({
      mutate: acheterMock,
      isPending: false,
      isError: true,
      error: null,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAcheterBonAchat>);

    renderWithProviders(<AcheterBonAchatPage />);
    expect(screen.getByText("bon_achat_acheter.erreur")).toBeInTheDocument();
  });
});
