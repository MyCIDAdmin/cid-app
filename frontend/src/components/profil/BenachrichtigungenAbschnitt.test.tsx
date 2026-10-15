import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../../api/auth";
import * as api from "../../api/telegram";
import { useAuthStore, type CidUser } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import BenachrichtigungenAbschnitt from "./BenachrichtigungenAbschnitt";

vi.mock("../../api/telegram", () => ({
  getTelegram: vi.fn(),
  telegramVerbinden: vi.fn(),
  telegramKategorien: vi.fn(),
  telegramTrennen: vi.fn(),
  telegramTest: vi.fn(),
}));
vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, speicherePraeferenzen: vi.fn() };
});

const VERFUEGBAR = ["regionen", "kalender"];

function zustand(o: Partial<api.TelegramZustand> = {}): api.TelegramZustand {
  return {
    aktiv: true,
    bot: "MyCID_Chatbot",
    verbunden: false,
    verknuepft_am: null,
    kategorien: VERFUEGBAR,
    verfuegbar: VERFUEGBAR,
    ...o,
  };
}

function user(o: Partial<CidUser> = {}): CidUser {
  return {
    id: "u",
    email: "a@b.de",
    role: "membre",
    langue_preferee: "de",
    ist_fan: false,
    ...o,
  } as CidUser;
}

describe("BenachrichtigungenAbschnitt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: user() });
  });

  it("blendet Telegram aus, wenn der Bot nicht eingerichtet ist", async () => {
    vi.mocked(api.getTelegram).mockResolvedValue(zustand({ aktiv: false }));
    renderWithProviders(<BenachrichtigungenAbschnitt />);
    await waitFor(() => expect(api.getTelegram).toHaveBeenCalled());
    expect(screen.queryByText("einstellungen.telegram.titel")).not.toBeInTheDocument();
  });

  it("erzeugt den Link zum Verbinden", async () => {
    vi.mocked(api.getTelegram).mockResolvedValue(zustand());
    vi.mocked(api.telegramVerbinden).mockResolvedValue({
      link: "https://t.me/MyCID_Chatbot?start=abc",
      gueltig_bis: "2026-10-15T12:00:00Z",
    });
    renderWithProviders(<BenachrichtigungenAbschnitt />);
    fireEvent.click(await screen.findByText("einstellungen.telegram.verbinden"));
    const a = await screen.findByText("einstellungen.telegram.oeffnen");
    expect(a).toHaveAttribute("href", "https://t.me/MyCID_Chatbot?start=abc");
    expect(screen.getByText("einstellungen.telegram.warten")).toBeInTheDocument();
  });

  it("schaltet Arten um, sendet einen Test und trennt", async () => {
    vi.mocked(api.getTelegram).mockResolvedValue(zustand({ verbunden: true }));
    vi.mocked(api.telegramKategorien).mockResolvedValue(zustand({ verbunden: true }));
    vi.mocked(api.telegramTest).mockResolvedValue();
    vi.mocked(api.telegramTrennen).mockResolvedValue();
    renderWithProviders(<BenachrichtigungenAbschnitt />);
    fireEvent.click(await screen.findByLabelText("einstellungen.telegram.art.kalender"));
    await waitFor(() => expect(api.telegramKategorien).toHaveBeenCalled());
    expect(vi.mocked(api.telegramKategorien).mock.calls[0][0]).toEqual(["regionen"]);
    fireEvent.click(screen.getByText("einstellungen.telegram.test"));
    expect(await screen.findByText("einstellungen.telegram.test_gesendet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("einstellungen.telegram.trennen"));
    await waitFor(() => expect(api.telegramTrennen).toHaveBeenCalled());
  });

  it("zeigt einen Fehler, wenn das Verbinden scheitert", async () => {
    vi.mocked(api.getTelegram).mockResolvedValue(zustand());
    vi.mocked(api.telegramVerbinden).mockRejectedValue(new Error("x"));
    renderWithProviders(<BenachrichtigungenAbschnitt />);
    fireEvent.click(await screen.findByText("einstellungen.telegram.verbinden"));
    expect(await screen.findByRole("alert")).toHaveTextContent("einstellungen.telegram.fehler");
  });

  it("schaltet den Geburtstagsgruß um und versteckt ihn für Fan-Konten", async () => {
    vi.mocked(api.getTelegram).mockResolvedValue(zustand({ aktiv: false }));
    vi.mocked(authApi.speicherePraeferenzen).mockResolvedValue(
      user({ ui_praeferenzen: { geburtstagsgruss: false } }),
    );
    const { unmount } = renderWithProviders(<BenachrichtigungenAbschnitt />);
    const box = screen.getByLabelText("einstellungen.geburtstag.titel");
    expect(box).toBeChecked();
    fireEvent.click(box);
    await waitFor(() =>
      expect(authApi.speicherePraeferenzen).toHaveBeenCalledWith({
        ui_praeferenzen: { geburtstagsgruss: false },
      }),
    );
    await waitFor(() => expect(box).not.toBeChecked());
    unmount();
    useAuthStore.setState({ user: user({ ist_fan: true }) });
    renderWithProviders(<BenachrichtigungenAbschnitt />);
    expect(screen.queryByLabelText("einstellungen.geburtstag.titel")).not.toBeInTheDocument();
  });
});
