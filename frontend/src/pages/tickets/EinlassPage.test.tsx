import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as einlassApi from "../../api/einlass";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { EinlassUebersicht, TicketStand } from "../../types/einlass";
import EinlassPage from "./EinlassPage";

vi.mock("../../api/einlass", () => ({
  getEinlass: vi.fn(),
  einlassPruefen: vi.fn(),
  einlassBuchen: vi.fn(),
  einlassRuecknahme: vi.fn(),
  getHelfer: vi.fn(),
  helferBenennen: vi.fn(),
  helferEntfernen: vi.fn(),
  getMeinEinlass: vi.fn(),
}));

// Die Kamera gibt es in jsdom nicht : der Scanner wird durch einen Knopf ersetzt, der einen Code meldet.
vi.mock("../../components/einlass/QrScanner", () => ({
  default: ({ onCode }: { onCode: (text: string) => void }) => (
    <button type="button" onClick={() => onCode("CID-T:abc")}>
      kamera-erkennt-code
    </button>
  ),
}));

function stand(teil: Partial<TicketStand> = {}): TicketStand {
  return {
    ticket: "t1",
    name: "Sami Ben Ali",
    gebucht_erwachsene: 2,
    gebucht_kinder: 1,
    drin_erwachsene: 0,
    drin_kinder: 0,
    offen_erwachsene: 2,
    offen_kinder: 1,
    status: "offen",
    ...teil,
  };
}

function uebersicht(teil: Partial<EinlassUebersicht> = {}): EinlassUebersicht {
  return {
    typ: "veranstaltung",
    id: "e1",
    titel: "Sommerfest",
    datum: "2099-06-20",
    datum_bis: "2099-06-20",
    ticket_aktiv: true,
    zaehler: { gebucht_erwachsene: 2, gebucht_kinder: 1, drin_erwachsene: 0, drin_kinder: 0 },
    personen: [stand(), stand({ ticket: "t2", name: "Aya Zed", status: "vollstaendig" })],
    darf_helfer_verwalten: false,
    ...teil,
  };
}

function rendern() {
  return renderWithProviders(<EinlassPage />, {
    route: "/einlass/veranstaltung/e1",
    path: "/einlass/:typ/:id",
  });
}

describe("EinlassPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(einlassApi.getEinlass).mockResolvedValue(uebersicht());
  });

  it("zeigt Titel, Zähler und die Liste der Angemeldeten", async () => {
    rendern();
    expect(await screen.findByText("Sommerfest")).toBeInTheDocument();
    expect(screen.getByText("Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
  });

  it("zeigt eine Fehlermeldung ohne Zugriff", async () => {
    vi.mocked(einlassApi.getEinlass).mockRejectedValue(new Error("403"));
    rendern();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("weist darauf hin, wenn Tickets nicht aktiviert sind", async () => {
    vi.mocked(einlassApi.getEinlass).mockResolvedValue(uebersicht({ ticket_aktiv: false }));
    rendern();
    expect(await screen.findByText("einlass_nicht_aktiv")).toBeInTheDocument();
  });

  it("lässt nach dem Scan alle offenen Personen ein", async () => {
    vi.mocked(einlassApi.einlassPruefen).mockResolvedValue({
      ergebnis: "gueltig",
      ticket: stand(),
    });
    vi.mocked(einlassApi.einlassBuchen).mockResolvedValue({
      stand: stand({
        status: "vollstaendig",
        offen_erwachsene: 0,
        offen_kinder: 0,
        drin_erwachsene: 2,
        drin_kinder: 1,
      }),
      einlass: "x1",
    });
    rendern();
    fireEvent.click(await screen.findByRole("button", { name: "scan_starten" }));
    fireEvent.click(screen.getByRole("button", { name: "kamera-erkennt-code" }));
    await waitFor(() =>
      expect(einlassApi.einlassPruefen).toHaveBeenCalledWith("veranstaltung", "e1", "CID-T:abc"),
    );
    await screen.findByRole("button", { name: "einlass_erwachsene +" });
    fireEvent.click(screen.getAllByRole("button", { name: "einlass_einlassen" })[0]);
    await waitFor(() =>
      expect(einlassApi.einlassBuchen).toHaveBeenCalledWith("veranstaltung", "e1", {
        ticket: "t1",
        erwachsene: 2,
        kinder: 1,
      }),
    );
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("lässt nur einen Teil der Gruppe ein", async () => {
    vi.mocked(einlassApi.einlassPruefen).mockResolvedValue({
      ergebnis: "gueltig",
      ticket: stand(),
    });
    vi.mocked(einlassApi.einlassBuchen).mockResolvedValue({
      stand: stand({ status: "teilweise", offen_erwachsene: 1, drin_erwachsene: 1 }),
      einlass: "x1",
    });
    rendern();
    fireEvent.click(await screen.findByRole("button", { name: "scan_starten" }));
    fireEvent.click(screen.getByRole("button", { name: "kamera-erkennt-code" }));
    await screen.findByRole("button", { name: "einlass_erwachsene −" });
    fireEvent.click(screen.getByRole("button", { name: "einlass_erwachsene −" }));
    fireEvent.click(screen.getByRole("button", { name: "einlass_kinder −" }));
    fireEvent.click(screen.getAllByRole("button", { name: "einlass_einlassen" })[0]);
    await waitFor(() =>
      expect(einlassApi.einlassBuchen).toHaveBeenCalledWith("veranstaltung", "e1", {
        ticket: "t1",
        erwachsene: 1,
        kinder: 0,
      }),
    );
  });

  it("nimmt den letzten Eintrag zurück", async () => {
    vi.mocked(einlassApi.einlassPruefen).mockResolvedValue({
      ergebnis: "gueltig",
      ticket: stand(),
    });
    vi.mocked(einlassApi.einlassBuchen).mockResolvedValue({ stand: stand(), einlass: "x1" });
    vi.mocked(einlassApi.einlassRuecknahme).mockResolvedValue(stand());
    rendern();
    fireEvent.click(await screen.findByRole("button", { name: "scan_starten" }));
    fireEvent.click(screen.getByRole("button", { name: "kamera-erkennt-code" }));
    await screen.findByRole("button", { name: "einlass_erwachsene +" });
    fireEvent.click(screen.getAllByRole("button", { name: "einlass_einlassen" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "einlass_rueckgaengig" }));
    await waitFor(() => expect(einlassApi.einlassRuecknahme).toHaveBeenCalledWith("x1"));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("zeigt bei unbekanntem Code eine rote Meldung", async () => {
    vi.mocked(einlassApi.einlassPruefen).mockResolvedValue({ ergebnis: "unbekannt" });
    rendern();
    fireEvent.change(await screen.findByLabelText("scan_code_manuell"), {
      target: { value: "falsch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "scan_pruefen" }));
    expect(await screen.findByText("ergebnis_unbekannt")).toBeInTheDocument();
    expect(einlassApi.einlassBuchen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "einlass_weiter" }));
    expect(screen.queryByText("ergebnis_unbekannt")).not.toBeInTheDocument();
  });

  it("öffnet aus der Liste ohne Scan das Einlass-Feld und filtert nach Namen", async () => {
    rendern();
    await screen.findByText("Sami Ben Ali");
    fireEvent.change(screen.getByLabelText("liste_suche"), { target: { value: "zed" } });
    expect(screen.queryByText("Sami Ben Ali")).not.toBeInTheDocument();
    expect(screen.getByText("Aya Zed")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("liste_suche"), { target: { value: "" } });
    fireEvent.click(screen.getAllByRole("button", { name: "einlass_einlassen" })[0]);
    expect(await screen.findByRole("button", { name: "einlass_erwachsene +" })).toBeInTheDocument();
  });

  it("zeigt die Helferverwaltung nur für Verantwortliche", async () => {
    vi.mocked(einlassApi.getEinlass).mockResolvedValue(uebersicht({ darf_helfer_verwalten: true }));
    vi.mocked(einlassApi.getHelfer).mockResolvedValue([
      { id: "h1", name: "Hela Fer", email: "hela@example.de" },
    ]);
    vi.mocked(einlassApi.helferBenennen).mockResolvedValue([
      { id: "h1", name: "Hela Fer", email: "hela@example.de" },
      { id: "h2", name: "Neu Er", email: "neu@example.de" },
    ]);
    rendern();
    expect(await screen.findByText("helfer_titel")).toBeInTheDocument();
    expect(await screen.findByText(/Hela Fer/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("helfer_email"), {
      target: { value: "neu@example.de" },
    });
    fireEvent.click(screen.getByRole("button", { name: "helfer_hinzufuegen" }));
    await waitFor(() =>
      expect(einlassApi.helferBenennen).toHaveBeenCalledWith(
        "veranstaltung",
        "e1",
        "neu@example.de",
      ),
    );
    expect(await screen.findByText(/Neu Er/)).toBeInTheDocument();
  });

  it("versteckt die Helferverwaltung für Helfer", async () => {
    rendern();
    await screen.findByText("Sommerfest");
    expect(screen.queryByText("helfer_titel")).not.toBeInTheDocument();
  });
});
