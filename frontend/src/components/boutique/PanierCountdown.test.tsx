import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as boutiqueApi from "../../api/boutique";
import { usePanierStore } from "../../store/panierStore";
import PanierCountdown from "./PanierCountdown";

vi.mock("../../api/boutique", () => ({ reservierePanier: vi.fn() }));

function artikel() {
  usePanierStore.getState().ajouter({
    varianteId: "v1",
    produitId: "p1",
    nom: "Maillot",
    taille: "M",
    couleur: "",
    prixUnitaire: "45.00",
    stockDisponible: 5,
  });
}

describe("PanierCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    usePanierStore.setState({
      articles: [],
      reservierungEndeMs: null,
      erneuerungen: 0,
      maxErneuerungen: 2,
      geleertWegenAblauf: false,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("zeigt nichts bei leerem Warenkorb", () => {
    const { container } = render(<PanierCountdown />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zählt mm:ss herunter und wird dringend unter zwei Minuten", () => {
    artikel();
    usePanierStore.getState().setReservierungEnde(Date.now() + 125_000);
    render(<PanierCountdown />);
    expect(screen.getByRole("timer")).toHaveTextContent("02:05");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("01:55");
    expect(screen.getByRole("timer").className).toContain("status-dangerBg");
  });

  it("zeigt nach Ablauf den Hinweis; „Erneut reservieren“ startet den Countdown neu", async () => {
    artikel();
    usePanierStore.getState().setReservierungEnde(Date.now() + 2_000);
    vi.mocked(boutiqueApi.reservierePanier).mockResolvedValue({
      expire_le: "x",
      restzeit_sekunden: 1200,
      dauer_minuten: 20,
      zeilen: [{ variante: "v1", reserviert: 1, verfuegbar: 5 }],
    } as never);
    render(<PanierCountdown />);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText(/panier\.reservierung_abgelaufen/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("panier.erneut_reservieren"));
    });
    expect(boutiqueApi.reservierePanier).toHaveBeenCalledWith([{ variante: "v1", quantite: 1 }]);
    expect(screen.getByRole("timer")).toHaveTextContent("20:00");
    expect(usePanierStore.getState().erneuerungen).toBe(1);
  });

  it("zeigt nach Leeren wegen Ablauf einen Hinweis, der sich schließen lässt", () => {
    usePanierStore.setState({ geleertWegenAblauf: true });
    render(<PanierCountdown />);
    expect(screen.getByText("panier.geleert_hinweis")).toBeInTheDocument();
    fireEvent.click(screen.getByText("panier.hinweis_schliessen"));
    expect(screen.queryByText("panier.geleert_hinweis")).not.toBeInTheDocument();
  });
});
