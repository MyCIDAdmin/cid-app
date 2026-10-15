import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/support";
import { useAuthStore, type CidUser } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { FaqEintrag, Ticket, TicketDetail } from "../../types/support";
import BueroTickets from "./BueroTickets";
import FaqBereich from "./FaqBereich";
import FaqVerwaltung from "./FaqVerwaltung";
import MeineTickets from "./MeineTickets";
import TicketAnsicht from "./TicketAnsicht";

vi.mock("../../api/support", () => ({
  getFaq: vi.fn(),
  getFaqVerwaltung: vi.fn(),
  faqAnlegen: vi.fn(),
  faqAendern: vi.fn(),
  faqLoeschen: vi.fn(),
  getMeineTickets: vi.fn(),
  getAlleTickets: vi.fn(),
  getTicket: vi.fn(),
  ticketEroeffnen: vi.fn(),
  ticketAendern: vi.fn(),
  nachrichtSenden: vi.fn(),
}));

function faq(o: Partial<FaqEintrag> = {}): FaqEintrag {
  return {
    id: 1,
    frage_de: "Passwort vergessen?",
    frage_fr: "",
    antwort_de: "Link anfordern.",
    antwort_fr: "",
    kategorie: "konto",
    reihenfolge: 10,
    aktiv: true,
    ...o,
  };
}

function ticket(o: Partial<Ticket> = {}): Ticket {
  return {
    id: 7,
    betreff: "Code fehlt",
    kategorie: "konto",
    status: "offen",
    created_at: "2026-10-15T10:00:00Z",
    updated_at: "2026-10-15T10:00:00Z",
    geschlossen_am: null,
    ...o,
  };
}

function detail(o: Partial<TicketDetail> = {}): TicketDetail {
  return {
    ...ticket(),
    nachrichten: [
      {
        id: 1,
        von_support: false,
        intern: false,
        autor: "",
        text: "Ich bekomme keinen Code.",
        created_at: "2026-10-15T10:00:00Z",
      },
    ],
    kann_antworten: true,
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: "u1", role: "membre" } as unknown as CidUser });
});

describe("FaqBereich", () => {
  it("zeigt die Fragen und filtert per Suche", async () => {
    vi.mocked(api.getFaq).mockResolvedValue([
      faq(),
      faq({ id: 2, frage_de: "Sprache ändern?", antwort_de: "Umschalter." }),
    ]);
    renderWithProviders(<FaqBereich onTicket={vi.fn()} />);
    expect(await screen.findByText("Passwort vergessen?")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("faq.suche"), { target: { value: "sprache" } });
    expect(screen.queryByText("Passwort vergessen?")).not.toBeInTheDocument();
    expect(screen.getByText("Sprache ändern?")).toBeInTheDocument();
  });

  it("bietet das Ticket an, wenn nichts passt", async () => {
    vi.mocked(api.getFaq).mockResolvedValue([]);
    const onTicket = vi.fn();
    renderWithProviders(<FaqBereich onTicket={onTicket} />);
    fireEvent.click(await screen.findByText("ticket.neu"));
    expect(onTicket).toHaveBeenCalled();
  });
});

describe("MeineTickets", () => {
  it("listet eigene Tickets und öffnet eines", async () => {
    vi.mocked(api.getMeineTickets).mockResolvedValue([ticket()]);
    const onOeffnen = vi.fn();
    renderWithProviders(<MeineTickets neu={false} setNeu={vi.fn()} onOeffnen={onOeffnen} />);
    fireEvent.click(await screen.findByText(/Code fehlt/));
    expect(onOeffnen).toHaveBeenCalledWith(7);
  });

  it("eröffnet ein Ticket", async () => {
    vi.mocked(api.ticketEroeffnen).mockResolvedValue(detail());
    const onOeffnen = vi.fn();
    const setNeu = vi.fn();
    renderWithProviders(<MeineTickets neu setNeu={setNeu} onOeffnen={onOeffnen} />);
    const absenden = screen.getByText("ticket.absenden");
    expect(absenden).toBeDisabled();
    fireEvent.change(screen.getByLabelText("ticket.betreff"), { target: { value: "Code fehlt" } });
    fireEvent.change(screen.getByLabelText("ticket.beschreibung"), {
      target: { value: "Kein Code da." },
    });
    fireEvent.click(absenden);
    await waitFor(() =>
      expect(api.ticketEroeffnen).toHaveBeenCalledWith({
        betreff: "Code fehlt",
        kategorie: "sonstiges",
        text: "Kein Code da.",
      }),
    );
    await waitFor(() => expect(onOeffnen).toHaveBeenCalledWith(7));
  });

  it("zeigt die Begrenzung als Hinweis", async () => {
    vi.mocked(api.ticketEroeffnen).mockRejectedValue({
      response: { status: 429, data: { detail: "zu_viele_tickets" } },
    });
    renderWithProviders(<MeineTickets neu setNeu={vi.fn()} onOeffnen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("ticket.betreff"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("ticket.beschreibung"), { target: { value: "b" } });
    fireEvent.click(screen.getByText("ticket.absenden"));
    expect(await screen.findByText("ticket.zu_viele_tickets")).toBeInTheDocument();
  });
});

describe("TicketAnsicht", () => {
  it("Person: antworten und schliessen, ohne Büro-Werkzeuge", async () => {
    vi.mocked(api.getTicket).mockResolvedValue(detail());
    vi.mocked(api.nachrichtSenden).mockResolvedValue(detail());
    vi.mocked(api.ticketAendern).mockResolvedValue(detail({ status: "geschlossen" }));
    renderWithProviders(<TicketAnsicht id={7} buero={false} onZurueck={vi.fn()} />);
    expect(await screen.findByText("Ich bekomme keinen Code.")).toBeInTheDocument();
    expect(screen.queryByText("ticket.intern")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ticket.antworten"), { target: { value: "Danke" } });
    fireEvent.click(screen.getByText("ticket.senden"));
    await waitFor(() => expect(api.nachrichtSenden).toHaveBeenCalledWith(7, { text: "Danke" }));
    fireEvent.click(screen.getByText("ticket.schliessen"));
    await waitFor(() =>
      expect(api.ticketAendern).toHaveBeenCalledWith(7, { status: "geschlossen" }),
    );
  });

  it("Büro: antwortet mit Status und schreibt interne Notiz", async () => {
    vi.mocked(api.getTicket).mockResolvedValue(
      detail({ name: "Mia Muster", art: "mitglied", bearbeiter: null }),
    );
    vi.mocked(api.nachrichtSenden).mockResolvedValue(detail());
    renderWithProviders(<TicketAnsicht id={7} buero onZurueck={vi.fn()} />);
    await screen.findByText("Ich bekomme keinen Code.");
    fireEvent.change(screen.getByLabelText("ticket.antworten"), { target: { value: "Gelöst" } });
    fireEvent.change(screen.getByDisplayValue("status.wartet_auf_antwort"), {
      target: { value: "geloest" },
    });
    fireEvent.click(screen.getByText("ticket.senden"));
    await waitFor(() =>
      expect(api.nachrichtSenden).toHaveBeenCalledWith(7, {
        text: "Gelöst",
        intern: false,
        status: "geloest",
      }),
    );
    fireEvent.click(screen.getByLabelText("ticket.intern"));
    fireEvent.change(screen.getByLabelText("ticket.notiz"), { target: { value: "Prüfen" } });
    fireEvent.click(screen.getByText("ticket.notiz_speichern"));
    await waitFor(() =>
      expect(api.nachrichtSenden).toHaveBeenLastCalledWith(7, { text: "Prüfen", intern: true }),
    );
  });

  it("Büro: weist sich das Ticket zu", async () => {
    vi.mocked(api.getTicket).mockResolvedValue(detail({ name: "Mia", bearbeiter: null }));
    vi.mocked(api.ticketAendern).mockResolvedValue(detail());
    renderWithProviders(<TicketAnsicht id={7} buero onZurueck={vi.fn()} />);
    fireEvent.click(await screen.findByText("buero.mir_zuweisen"));
    await waitFor(() => expect(api.ticketAendern).toHaveBeenCalledWith(7, { bearbeiter: "u1" }));
  });

  it("geschlossenes Ticket: kein Antwortfeld", async () => {
    vi.mocked(api.getTicket).mockResolvedValue(
      detail({ status: "geschlossen", kann_antworten: false }),
    );
    renderWithProviders(<TicketAnsicht id={7} buero={false} onZurueck={vi.fn()} />);
    expect(await screen.findByText("ticket.geschlossen_hinweis")).toBeInTheDocument();
    expect(screen.queryByText("ticket.senden")).not.toBeInTheDocument();
  });
});

describe("BueroTickets", () => {
  it("lädt mit Filter und öffnet ein Ticket", async () => {
    vi.mocked(api.getAlleTickets).mockResolvedValue([
      ticket({ name: "Mia Muster", art: "fan", bearbeiter: { id: "b", name: "Ben" } }),
    ]);
    const onOeffnen = vi.fn();
    renderWithProviders(<BueroTickets onOeffnen={onOeffnen} />);
    expect(await screen.findByText("Mia Muster")).toBeInTheDocument();
    expect(api.getAlleTickets).toHaveBeenCalledWith({ status: "aktiv", q: "" });
    fireEvent.change(screen.getByLabelText("buero.suche"), { target: { value: "code" } });
    await waitFor(() =>
      expect(api.getAlleTickets).toHaveBeenLastCalledWith({ status: "aktiv", q: "code" }),
    );
    fireEvent.click(screen.getByText("Code fehlt"));
    expect(onOeffnen).toHaveBeenCalledWith(7);
  });
});

describe("FaqVerwaltung", () => {
  it("legt eine Frage an und blendet eine aus", async () => {
    vi.mocked(api.getFaqVerwaltung).mockResolvedValue([faq()]);
    vi.mocked(api.faqAnlegen).mockResolvedValue(faq({ id: 9 }));
    vi.mocked(api.faqAendern).mockResolvedValue(faq({ aktiv: false }));
    renderWithProviders(<FaqVerwaltung />);
    fireEvent.click(await screen.findByText("faqv.ausblenden"));
    await waitFor(() => expect(api.faqAendern).toHaveBeenCalledWith(1, { aktiv: false }));

    fireEvent.click(screen.getByText("faqv.neu"));
    const speichern = screen.getByText("faqv.speichern");
    expect(speichern).toBeDisabled();
    fireEvent.change(screen.getByLabelText("faqv.frage_de"), { target: { value: "Frage?" } });
    fireEvent.change(screen.getByLabelText("faqv.antwort_de"), { target: { value: "Antwort." } });
    fireEvent.click(speichern);
    await waitFor(() =>
      expect(api.faqAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({ frage_de: "Frage?", antwort_de: "Antwort.", aktiv: true }),
      ),
    );
  });
});
