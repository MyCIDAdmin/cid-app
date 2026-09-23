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
  };
});

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
    statut: "actif",
    achete_par: "m1",
    mode_paiement: "en_ligne",
    date_paiement_confirme: "2026-01-01T00:00:00Z",
    paiement_confirme_par: null,
    reference_paiement: "",
    date_expiration: "2029-01-01T00:00:00Z",
    utilisable: true,
    est_expire: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// Purement en lecture seule depuis le 2026-09-23 (demande utilisateur : "Gutschein wird ein
// echtes Produkt im Katalog") — voir docstring de GestionBonsAchatTab : un bon naît déjà actif,
// il n'y a donc plus d'action de confirmation de paiement à tester ici, quel que soit le rôle.
describe("GestionBonsAchatTab", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });

    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: { next: null, previous: null, results: [bonAchat()] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);
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

  it("n'affiche aucune action de confirmation de paiement (lecture seule)", () => {
    renderWithProviders(<GestionBonsAchatTab />);
    expect(screen.queryByText("paiement.confirmer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("paiement.mode_label")).not.toBeInTheDocument();
  });

  it("filtre les bons par statut", () => {
    renderWithProviders(<GestionBonsAchatTab />);
    // Le bouton de filtre et le badge de statut de la ligne partagent le même libellé
    // ("statut_bon_achat.actif") — cibler explicitement le bouton pour lever l'ambiguïté.
    fireEvent.click(screen.getByRole("button", { name: "statut_bon_achat.actif" }));
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
