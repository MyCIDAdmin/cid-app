import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as einlassApi from "../../api/einlass";
import * as eintrittApi from "../../api/eintritt";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { MeineTicketsAntwort, Ticket } from "../../types/tickets";
import TicketsPage from "./TicketsPage";

vi.mock("../../api/einlass", () => ({
  getMeinEinlass: vi.fn(),
}));

vi.mock("../../api/eintritt", () => ({
  getMeineTickets: vi.fn(),
  ticketSenden: vi.fn(),
  ticketErneuern: vi.fn(),
}));

const ticket: Ticket = {
  id: "t1",
  art: "veranstaltung",
  titel: "Sommerfest",
  datum: "2099-06-20",
  uhrzeit: "15:00:00",
  ort: "Stuttgart",
  erwachsene: 2,
  kinder: 1,
  name: "Aya Test",
  qr: "data:image/png;base64,AAAA",
  versendet_am: null,
};

function antwort(tickets: Ticket[], telegram = false): MeineTicketsAntwort {
  return { tickets, telegram_verbunden: telegram };
}

describe("TicketsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(einlassApi.getMeinEinlass).mockResolvedValue([]);
  });

  it("zeigt Einlass-Veranstaltungen für Prüfer und Helfer", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([]));
    vi.mocked(einlassApi.getMeinEinlass).mockResolvedValue([
      {
        typ: "veranstaltung",
        id: "e1",
        titel: "Sommerfest",
        datum: "2099-06-20",
        datum_bis: "2099-06-20",
        uhrzeit: null,
        ort: "Stuttgart",
        rolle: "helfer",
        heute: true,
      },
    ]);
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    const link = await screen.findByRole("link", { name: "einlass_oeffnen" });
    expect(link).toHaveAttribute("href", "/einlass/veranstaltung/e1");
  });

  it("zeigt das Ticket mit QR-Bild und Titel", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([ticket]));
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    expect(await screen.findByText("Sommerfest")).toBeInTheDocument();
    const bild = screen.getByRole("img");
    expect(bild).toHaveAttribute("src", ticket.qr);
    expect(screen.getByText("Aya Test")).toBeInTheDocument();
  });

  it("zeigt einen Hinweis, wenn keine Tickets vorliegen", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([]));
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    expect(await screen.findByText("leer")).toBeInTheDocument();
  });

  it("weist auf Telegram hin, solange es nicht verbunden ist", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([ticket], false));
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    expect(await screen.findByText("Sommerfest")).toBeInTheDocument();
    expect(screen.getByText(/hinweis_telegram/)).toBeInTheDocument();
  });

  it("versteckt den Telegram-Hinweis bei verbundenem Telegram", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([ticket], true));
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    expect(await screen.findByText("Sommerfest")).toBeInTheDocument();
    expect(screen.queryByText(/hinweis_telegram/)).not.toBeInTheDocument();
  });

  it("sendet das Ticket erneut", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([ticket]));
    vi.mocked(eintrittApi.ticketSenden).mockResolvedValue(undefined);
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    fireEvent.click(await screen.findByRole("button", { name: "erneut_senden" }));
    await waitFor(() => expect(eintrittApi.ticketSenden).toHaveBeenCalledWith("t1"));
    expect(await screen.findByText("gesendet")).toBeInTheDocument();
  });

  it("erneuert das Ticket und lädt die Liste neu", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([ticket]));
    vi.mocked(eintrittApi.ticketErneuern).mockResolvedValue(undefined);
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    fireEvent.click(await screen.findByRole("button", { name: "erneuern" }));
    await waitFor(() => expect(eintrittApi.ticketErneuern).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(eintrittApi.getMeineTickets).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("erneuert")).toBeInTheDocument();
  });

  it("zeigt einen Fehler, wenn das Senden scheitert", async () => {
    vi.mocked(eintrittApi.getMeineTickets).mockResolvedValue(antwort([ticket]));
    vi.mocked(eintrittApi.ticketSenden).mockRejectedValue(new Error("x"));
    renderWithProviders(<TicketsPage />, { route: "/tickets", path: "/tickets" });
    fireEvent.click(await screen.findByRole("button", { name: "erneut_senden" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
