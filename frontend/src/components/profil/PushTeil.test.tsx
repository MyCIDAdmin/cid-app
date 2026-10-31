import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/push";
import { renderWithProviders } from "../../test/renderWithProviders";
import * as geraet from "../../utils/push";
import PushTeil from "./PushTeil";

vi.mock("../../api/push", () => ({
  getPush: vi.fn(),
  pushAnmelden: vi.fn(),
  pushAbmelden: vi.fn(),
  pushKategorien: vi.fn(),
  pushTest: vi.fn(),
}));
vi.mock("../../utils/push", () => ({
  pushLage: vi.fn(),
  aktuelleAnmeldung: vi.fn(),
  anmeldungErzeugen: vi.fn(),
  alsAboDaten: vi.fn(),
}));

const VERFUEGBAR = ["regionen", "kalender"];
const DIESES = "https://fcm.googleapis.com/fcm/send/dieses";
const ANDERES = "https://fcm.googleapis.com/fcm/send/anderes";

function zustand(o: Partial<api.PushZustand> = {}): api.PushZustand {
  return {
    aktiv: true,
    schluessel: "BKey",
    geraete: [],
    kategorien: VERFUEGBAR,
    verfuegbar: VERFUEGBAR,
    ...o,
  };
}

function abo(endpoint: string, name = "Android · Chrome") {
  return {
    id: endpoint.slice(-6),
    endpoint,
    geraet: name,
    created_at: "2026-10-31T10:00:00Z",
    zuletzt_zugestellt: null,
  };
}

function sub(endpoint: string) {
  return { endpoint, unsubscribe: vi.fn().mockResolvedValue(true) } as unknown as PushSubscription;
}

describe("PushTeil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(geraet.pushLage).mockReturnValue("bereit");
    vi.mocked(geraet.aktuelleAnmeldung).mockResolvedValue(null);
  });

  it("ist unsichtbar, wenn der Server Push nicht eingerichtet hat", async () => {
    vi.mocked(api.getPush).mockResolvedValue(zustand({ aktiv: false, kategorien: [] }));
    renderWithProviders(<PushTeil />);
    await waitFor(() => expect(api.getPush).toHaveBeenCalled());
    expect(screen.queryByText("einstellungen.push.titel")).not.toBeInTheDocument();
  });

  it("zeigt Datenschutz-Hinweis und Einschalten-Knopf", async () => {
    vi.mocked(api.getPush).mockResolvedValue(zustand());
    renderWithProviders(<PushTeil />);
    expect(await screen.findByText("einstellungen.push.hinweis")).toBeInTheDocument();
    expect(screen.getByText("einstellungen.push.einschalten")).toBeInTheDocument();
  });

  it("iPhone ohne Installation: Anleitung statt Knopf", async () => {
    vi.mocked(geraet.pushLage).mockReturnValue("ios_installieren");
    vi.mocked(api.getPush).mockResolvedValue(zustand());
    renderWithProviders(<PushTeil />);
    expect(await screen.findByText("einstellungen.push.ios_installieren")).toBeInTheDocument();
    expect(screen.queryByText("einstellungen.push.einschalten")).not.toBeInTheDocument();
  });

  it("nicht unterstützter Browser: Hinweis statt Knopf", async () => {
    vi.mocked(geraet.pushLage).mockReturnValue("nicht_unterstuetzt");
    vi.mocked(api.getPush).mockResolvedValue(zustand());
    renderWithProviders(<PushTeil />);
    expect(await screen.findByText("einstellungen.push.nicht_unterstuetzt")).toBeInTheDocument();
    expect(screen.queryByText("einstellungen.push.einschalten")).not.toBeInTheDocument();
  });

  it("abgelehnte Erlaubnis: Hinweis zum Freigeben", async () => {
    vi.mocked(geraet.pushLage).mockReturnValue("abgelehnt");
    vi.mocked(api.getPush).mockResolvedValue(zustand());
    renderWithProviders(<PushTeil />);
    expect(await screen.findByText("einstellungen.push.abgelehnt")).toBeInTheDocument();
    expect(screen.queryByText("einstellungen.push.einschalten")).not.toBeInTheDocument();
  });

  it("Einschalten meldet das Gerät beim Server an", async () => {
    const neu = sub(DIESES);
    vi.mocked(api.getPush).mockResolvedValue(zustand());
    vi.mocked(geraet.anmeldungErzeugen).mockResolvedValue(neu);
    vi.mocked(geraet.alsAboDaten).mockReturnValue({
      endpoint: DIESES,
      keys: { p256dh: "p", auth: "a" },
    });
    vi.mocked(api.pushAnmelden).mockResolvedValue(zustand({ geraete: [abo(DIESES)] }));
    renderWithProviders(<PushTeil />);
    fireEvent.click(await screen.findByText("einstellungen.push.einschalten"));
    await waitFor(() => expect(geraet.anmeldungErzeugen).toHaveBeenCalledWith("BKey"));
    await waitFor(() =>
      expect(api.pushAnmelden).toHaveBeenCalledWith({
        endpoint: DIESES,
        keys: { p256dh: "p", auth: "a" },
      }),
    );
    expect(await screen.findByText("einstellungen.push.an")).toBeInTheDocument();
  });

  it("verweigerte Browser-Erlaubnis zeigt den Hinweis und meldet nichts an", async () => {
    vi.mocked(api.getPush).mockResolvedValue(zustand());
    vi.mocked(geraet.anmeldungErzeugen).mockRejectedValue(new Error("permission"));
    vi.mocked(geraet.pushLage).mockReturnValue("bereit");
    renderWithProviders(<PushTeil />);
    fireEvent.click(await screen.findByText("einstellungen.push.einschalten"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "einstellungen.push.erlaubnis_fehlt",
    );
    expect(api.pushAnmelden).not.toHaveBeenCalled();
  });

  it("eingeschaltet: Arten wählen, Testmeldung, Ausschalten", async () => {
    const meine = sub(DIESES);
    vi.mocked(geraet.aktuelleAnmeldung).mockResolvedValue(meine);
    vi.mocked(api.getPush).mockResolvedValue(zustand({ geraete: [abo(DIESES)] }));
    vi.mocked(api.pushKategorien).mockResolvedValue(
      zustand({ geraete: [abo(DIESES)], kategorien: ["regionen"] }),
    );
    vi.mocked(api.pushTest).mockResolvedValue();
    vi.mocked(api.pushAbmelden).mockResolvedValue();
    renderWithProviders(<PushTeil />);

    expect(await screen.findByText("einstellungen.push.an")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("einstellungen.telegram.art.kalender"));
    await waitFor(() => expect(api.pushKategorien).toHaveBeenCalled());
    expect(vi.mocked(api.pushKategorien).mock.calls[0][0]).toEqual(["regionen"]);

    fireEvent.click(screen.getByText("einstellungen.push.test"));
    expect(await screen.findByText("einstellungen.push.test_gesendet")).toBeInTheDocument();

    vi.mocked(geraet.aktuelleAnmeldung).mockResolvedValue(meine);
    fireEvent.click(screen.getByText("einstellungen.push.ausschalten"));
    await waitFor(() => expect(api.pushAbmelden).toHaveBeenCalled());
    expect(vi.mocked(api.pushAbmelden).mock.calls[0][0]).toBe(DIESES);
    await waitFor(() => expect(meine.unsubscribe).toHaveBeenCalled());
  });

  it("Testmeldung ohne Zustellung zeigt einen eigenen Hinweis", async () => {
    vi.mocked(geraet.aktuelleAnmeldung).mockResolvedValue(sub(DIESES));
    vi.mocked(api.getPush).mockResolvedValue(zustand({ geraete: [abo(DIESES)] }));
    vi.mocked(api.pushTest).mockRejectedValue({ response: { status: 502 } });
    renderWithProviders(<PushTeil />);
    fireEvent.click(await screen.findByText("einstellungen.push.test"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "einstellungen.push.test_nicht_zugestellt",
    );
  });

  it("andere Geräte lassen sich entfernen, ohne dieses abzumelden", async () => {
    const meine = sub(DIESES);
    vi.mocked(geraet.aktuelleAnmeldung).mockResolvedValue(meine);
    vi.mocked(api.getPush).mockResolvedValue(
      zustand({ geraete: [abo(DIESES), abo(ANDERES, "iPhone/iPad · Safari")] }),
    );
    vi.mocked(api.pushAbmelden).mockResolvedValue();
    renderWithProviders(<PushTeil />);
    expect(await screen.findByText("iPhone/iPad · Safari")).toBeInTheDocument();
    fireEvent.click(screen.getByText("einstellungen.push.entfernen"));
    await waitFor(() => expect(api.pushAbmelden).toHaveBeenCalled());
    expect(vi.mocked(api.pushAbmelden).mock.calls[0][0]).toBe(ANDERES);
    expect(meine.unsubscribe).not.toHaveBeenCalled();
  });
});
