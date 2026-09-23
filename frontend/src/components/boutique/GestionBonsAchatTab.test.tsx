import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import { useAuthStore } from "../../store/authStore";
import type { BonAchat } from "../../types/boutique";
import GestionBonsAchatTab from "./GestionBonsAchatTab";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useBonsAchat: vi.fn(),
    useConfirmerPaiementBonAchat: vi.fn(),
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

function bonAchat(overrides: Partial<BonAchat> = {}): BonAchat {
  return {
    id: "b1",
    code: "BON-A1B2C3D4",
    montant_initial: "50.00",
    solde: "50.00",
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

describe("GestionBonsAchatTab", () => {
  let confirmerPaiementMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: dirFinancier,
      isAuthenticated: true,
    });

    confirmerPaiementMock = vi.fn();

    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: { next: null, previous: null, results: [bonAchat()] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);
    vi.mocked(useBoutiqueHooks.useConfirmerPaiementBonAchat).mockReturnValue({
      mutate: confirmerPaiementMock,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useConfirmerPaiementBonAchat>);
  });

  it("affiche le bon avec son code et son solde", () => {
    renderWithProviders(<GestionBonsAchatTab />);
    expect(screen.getByText("BON-A1B2C3D4")).toBeInTheDocument();
    expect(screen.getByText("50,00 €")).toBeInTheDocument();
  });

  it("affiche le solde initial en complément quand le bon est partiellement utilisé", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [bonAchat({ solde: "20.00", montant_initial: "50.00" })],
      },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderWithProviders(<GestionBonsAchatTab />);
    expect(screen.getByText("20,00 €")).toBeInTheDocument();
    expect(screen.getByText(/50,00 €/)).toBeInTheDocument();
  });

  it("confirme le paiement avec le mode sélectionné (Directeur Financier+)", () => {
    renderWithProviders(<GestionBonsAchatTab />);
    fireEvent.change(screen.getByLabelText("paiement.mode_label"), {
      target: { value: "especes" },
    });
    fireEvent.click(screen.getByText("paiement.confirmer"));
    expect(confirmerPaiementMock).toHaveBeenCalledWith({
      id: "b1",
      payload: { mode_paiement: "especes" },
    });
  });

  it("masque la confirmation de paiement pour un rôle inférieur à Directeur Financier", () => {
    useAuthStore.setState({ user: bureauAdmin });
    renderWithProviders(<GestionBonsAchatTab />);
    expect(screen.queryByText("paiement.confirmer")).not.toBeInTheDocument();
  });

  it("ne propose pas de confirmation pour un bon déjà actif", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: { next: null, previous: null, results: [bonAchat({ statut: "actif" })] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderWithProviders(<GestionBonsAchatTab />);
    expect(screen.queryByText("paiement.confirmer")).not.toBeInTheDocument();
  });

  it("filtre les bons par statut", () => {
    renderWithProviders(<GestionBonsAchatTab />);
    fireEvent.click(screen.getByText("statut_bon_achat.actif"));
    expect(useBoutiqueHooks.useBonsAchat).toHaveBeenLastCalledWith({ statut: "actif" });
  });

  it("affiche un message quand aucun bon ne correspond au filtre", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderWithProviders(<GestionBonsAchatTab />);
    expect(screen.getByText("bons_achat_admin.aucun_bon")).toBeInTheDocument();
  });
});
