import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { BonAchat } from "../../types/boutique";
import MesBonsAchatPage from "./MesBonsAchatPage";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useBonsAchat: vi.fn() };
});

function bonAchat(overrides: Partial<BonAchat> = {}): BonAchat {
  return {
    id: "b1",
    code: "BON-A1B2C3D4",
    montant_initial: "50.00",
    solde: "50.00",
    statut: "actif",
    achete_par: "m1",
    mode_paiement: "virement",
    date_paiement_confirme: "2026-01-02T00:00:00Z",
    paiement_confirme_par: "u2",
    reference_paiement: "",
    date_expiration: "2029-01-01T00:00:00Z",
    utilisable: true,
    est_expire: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function renderPage(route = "/boutique/bons-achat") {
  return renderWithProviders(<MesBonsAchatPage />, { route, path: "/boutique/bons-achat" });
}

describe("MesBonsAchatPage", () => {
  beforeEach(() => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);
  });

  it("affiche le message de chargement", () => {
    renderPage();
    expect(screen.getByText("mes_bons_achat.chargement")).toBeInTheDocument();
  });

  it("affiche les bons du membre avec leur code, solde et statut", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: { next: null, previous: null, results: [bonAchat()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderPage();

    expect(screen.getByText("BON-A1B2C3D4")).toBeInTheDocument();
    expect(screen.getByText("50,00 €")).toBeInTheDocument();
    expect(screen.getByText("statut_bon_achat.actif")).toBeInTheDocument();
  });

  it("affiche le montant initial en complément quand le bon est partiellement utilisé", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [bonAchat({ solde: "20.00", montant_initial: "50.00" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderPage();

    expect(screen.getByText("20,00 €")).toBeInTheDocument();
    expect(screen.getByText(/mes_bons_achat.sur_montant_initial/)).toBeInTheDocument();
  });

  it("affiche un message et un lien d'achat quand le membre n'a aucun bon", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderPage();

    expect(screen.getByText("mes_bons_achat.aucun_bon")).toBeInTheDocument();
    expect(screen.getAllByText("mes_bons_achat.acheter_lien").length).toBeGreaterThan(0);
  });

  it("affiche une erreur si le chargement échoue", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderPage();
    expect(screen.getByText("mes_bons_achat.erreur")).toBeInTheDocument();
  });

  it("met en évidence le bon ciblé par ?bon=", () => {
    vi.mocked(useBoutiqueHooks.useBonsAchat).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [bonAchat({ id: "b1" }), bonAchat({ id: "b2", code: "BON-XYZ99999" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useBonsAchat>);

    renderPage("/boutique/bons-achat?bon=b2");

    expect(screen.getByText("BON-XYZ99999")).toBeInTheDocument();
  });
});
