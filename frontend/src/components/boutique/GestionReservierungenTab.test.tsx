import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as boutiqueApi from "../../api/boutique";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Reservierung } from "../../types/boutique";
import GestionReservierungenTab from "./GestionReservierungenTab";

vi.mock("../../api/boutique", async () => {
  const actual = await vi.importActual<typeof boutiqueApi>("../../api/boutique");
  return {
    ...actual,
    listReservierungen: vi.fn(),
    listProduits: vi.fn(),
    reservierungAktion: vi.fn(),
  };
});

const eintrag: Reservierung = {
  id: "r1",
  produit: "p1",
  produit_nom: "Spieltag-Ticket",
  variante: null,
  variante_label: "",
  membre: "m1",
  membre_info: { id: "m1", prenom: "Amira", nom: "Ben Ali", email: "amira@example.org" },
  quantite: 2,
  statut: "aktiv",
  bemerkung: "",
  created_at: "2026-10-12T10:00:00Z",
};

describe("GestionReservierungenTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(boutiqueApi.listProduits).mockResolvedValue({
      next: null,
      previous: null,
      results: [],
    });
    vi.mocked(boutiqueApi.listReservierungen).mockResolvedValue({
      next: null,
      previous: null,
      results: [eintrag],
    });
  });

  it("listet Reservierungen und markiert sie als abgeholt", async () => {
    vi.mocked(boutiqueApi.reservierungAktion).mockResolvedValue(eintrag);
    renderWithProviders(<GestionReservierungenTab />);

    expect(await screen.findByText("Spieltag-Ticket")).toBeInTheDocument();
    fireEvent.click(screen.getByText("reservierungen_tab.abholen"));

    await waitFor(() =>
      expect(boutiqueApi.reservierungAktion).toHaveBeenCalledWith("r1", "abholen"),
    );
  });

  it("sperrt die Aktionen im Lesemodus", async () => {
    renderWithProviders(<GestionReservierungenTab modifiable={false} />);
    await screen.findByText("Spieltag-Ticket");
    expect(screen.getByText("reservierungen_tab.abholen")).toBeDisabled();
    expect(screen.getByText("reservierungen_tab.stornieren")).toBeDisabled();
  });
});
