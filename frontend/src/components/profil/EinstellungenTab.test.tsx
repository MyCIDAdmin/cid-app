import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../../api/auth";
import { useUiStore } from "../../store/uiStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import EinstellungenTab from "./EinstellungenTab";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return {
    ...actual,
    fetchGeraete: vi.fn(),
    geraetAbmelden: vi.fn(),
    andereGeraeteAbmelden: vi.fn(),
    passwortAendern: vi.fn(),
    fetchTotpStatus: vi.fn(),
    startTotpSetup: vi.fn(),
    confirmTotp: vi.fn(),
    disableTotp: vi.fn(),
  };
});

const geraete = {
  max_devices: 3,
  results: [
    {
      id: "s1",
      browser: "Chrome",
      os: "Windows",
      ip_address: "1.2.3.4",
      last_seen_at: "2026-10-07T10:00:00Z",
      created_at: "2026-10-01T10:00:00Z",
      is_current: true,
    },
    {
      id: "s2",
      browser: "Safari",
      os: "iOS",
      ip_address: null,
      last_seen_at: "2026-10-06T10:00:00Z",
      created_at: "2026-10-02T10:00:00Z",
      is_current: false,
    },
  ],
};

describe("EinstellungenTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ theme: "light", sidebarCollapsed: true });
    document.documentElement.classList.remove("dark");
    vi.mocked(authApi.fetchGeraete).mockResolvedValue(geraete);
    vi.mocked(authApi.fetchTotpStatus).mockResolvedValue({ totp_enabled: false });
  });

  it("wechselt den Anzeigemodus und die Seitenleiste", () => {
    renderWithProviders(<EinstellungenTab />);

    fireEvent.click(screen.getByText("einstellungen.dunkel"));
    expect(useUiStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByText("einstellungen.seitenleiste_gross"));
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it("listet Geräte, markiert das aktuelle und meldet ein anderes ab", async () => {
    vi.mocked(authApi.geraetAbmelden).mockResolvedValue();
    renderWithProviders(<EinstellungenTab />);

    expect(await screen.findByText("Chrome · Windows")).toBeInTheDocument();
    expect(screen.getByText("einstellungen.geraete.dieses")).toBeInTheDocument();
    // Nur das fremde Gerät hat einen "Abmelden"-Button.
    const buttons = screen.getAllByText("einstellungen.geraete.abmelden");
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(authApi.geraetAbmelden).toHaveBeenCalledWith("s2"));
  });

  it("meldet alle anderen Geräte ab", async () => {
    vi.mocked(authApi.andereGeraeteAbmelden).mockResolvedValue({ revoked: 1 });
    renderWithProviders(<EinstellungenTab />);

    fireEvent.click(await screen.findByText("einstellungen.geraete.alle_anderen"));
    await waitFor(() => expect(authApi.andereGeraeteAbmelden).toHaveBeenCalled());
  });

  it("prüft das Passwort clientseitig und ruft sonst die API auf", async () => {
    vi.mocked(authApi.passwortAendern).mockResolvedValue();
    renderWithProviders(<EinstellungenTab />);

    const aktuell = screen.getByLabelText("einstellungen.passwort.aktuell");
    const neu = screen.getByLabelText("einstellungen.passwort.neu");
    const wiederholung = screen.getByLabelText("einstellungen.passwort.wiederholung");
    const speichern = screen.getByText("einstellungen.passwort.speichern");

    fireEvent.change(aktuell, { target: { value: "AltesPasswort1!" } });
    fireEvent.change(neu, { target: { value: "kurz" } });
    fireEvent.click(speichern);
    expect(screen.getByText("einstellungen.passwort.zu_kurz")).toBeInTheDocument();

    fireEvent.change(neu, { target: { value: "NeuesPasswort456!" } });
    fireEvent.change(wiederholung, { target: { value: "Anders456!" } });
    fireEvent.click(speichern);
    expect(screen.getByText("einstellungen.passwort.nicht_gleich")).toBeInTheDocument();
    expect(authApi.passwortAendern).not.toHaveBeenCalled();

    fireEvent.change(wiederholung, { target: { value: "NeuesPasswort456!" } });
    fireEvent.click(speichern);
    await waitFor(() =>
      expect(authApi.passwortAendern).toHaveBeenCalledWith("AltesPasswort1!", "NeuesPasswort456!"),
    );
    expect(await screen.findByText("einstellungen.passwort.erfolg")).toBeInTheDocument();
  });

  it("richtet die Zwei-Faktor-Authentifizierung mit QR-Code ein", async () => {
    vi.mocked(authApi.startTotpSetup).mockResolvedValue({
      qr_code_base64: "QUJD",
      otpauth_url: "otpauth://totp/x",
    });
    vi.mocked(authApi.confirmTotp).mockResolvedValue();
    renderWithProviders(<EinstellungenTab />);

    fireEvent.click(await screen.findByText("einstellungen.zwei_faktor.aktivieren"));
    const qr = await screen.findByAltText("einstellungen.zwei_faktor.qr_alt");
    expect(qr).toHaveAttribute("src", "data:image/png;base64,QUJD");

    fireEvent.change(screen.getByLabelText("einstellungen.zwei_faktor.code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByText("einstellungen.zwei_faktor.bestaetigen"));
    await waitFor(() => expect(authApi.confirmTotp).toHaveBeenCalledWith("123456"));
  });

  it("zeigt aktives 2FA und deaktiviert es", async () => {
    vi.mocked(authApi.fetchTotpStatus).mockResolvedValue({ totp_enabled: true });
    vi.mocked(authApi.disableTotp).mockResolvedValue();
    renderWithProviders(<EinstellungenTab />);

    expect(await screen.findByText("einstellungen.zwei_faktor.aktiv")).toBeInTheDocument();
    fireEvent.click(screen.getByText("einstellungen.zwei_faktor.deaktivieren"));
    await waitFor(() => expect(authApi.disableTotp).toHaveBeenCalled());
  });
});
