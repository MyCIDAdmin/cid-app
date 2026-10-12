import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as boutiqueApi from "../../api/boutique";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Produit } from "../../types/boutique";
import ReservierungsBox from "./ReservierungsBox";

vi.mock("../../api/boutique", async () => {
  const actual = await vi.importActual<typeof boutiqueApi>("../../api/boutique");
  return { ...actual, erstelleReservierung: vi.fn() };
});

function produkt(teil: Partial<Produit> = {}): Produit {
  return {
    id: "p1",
    nom: "Spieltag-Ticket",
    variantes: [{ id: "v1", produit: "p1", taille: "", couleur: "", stock: 0 }],
    reservierung_modus: "nur_reservieren",
    reservierung_frist: null,
    reservierung_max_gesamt: 50,
    reservierung_max_pro_mitglied: 4,
    reservierung_verfuegbar: 12,
    reservierung_offen: true,
    reservierung_meine_menge: 0,
    ...teil,
  } as Produit;
}

describe("ReservierungsBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: true });
  });

  it("zeigt nichts, wenn das Produkt nicht reservierbar ist", () => {
    const { container } = renderWithProviders(
      <ReservierungsBox produit={produkt({ reservierung_modus: "aus" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt Restmenge und sendet die Reservierung", async () => {
    vi.mocked(boutiqueApi.erstelleReservierung).mockResolvedValue({} as never);
    renderWithProviders(<ReservierungsBox produit={produkt()} />);

    expect(screen.getByText("reservierung.info_verfuegbar")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(boutiqueApi.erstelleReservierung).toHaveBeenCalledWith({
        produit: "p1",
        variante: "v1",
        quantite: 2,
      }),
    );
  });

  it("sperrt das Formular, wenn ausgebucht", () => {
    renderWithProviders(
      <ReservierungsBox
        produit={produkt({ reservierung_offen: false, reservierung_verfuegbar: 0 })}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("bei 'reservieren und bezahlen' gibt es kein eigenes Formular", () => {
    renderWithProviders(
      <ReservierungsBox produit={produkt({ reservierung_modus: "reservieren_und_bezahlen" })} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
