import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../../api/auth";
import { renderWithProviders } from "../../test/renderWithProviders";
import PasskeyAbschnitt from "./PasskeyAbschnitt";

vi.mock("../../api/auth", () => ({
  fetchPasskeys: vi.fn(),
  passkeyEinrichten: vi.fn(),
  passkeyEntfernen: vi.fn(),
}));

vi.mock("../../utils/webauthn", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/webauthn")>("../../utils/webauthn");
  return { ...actual, passkeysUnterstuetzt: vi.fn(() => true) };
});

import { passkeysUnterstuetzt } from "../../utils/webauthn";

const eins = {
  id: "p1",
  name: "Mein Handy",
  created_at: "2026-11-15T10:00:00Z",
  last_used_at: null,
};

describe("PasskeyAbschnitt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(passkeysUnterstuetzt).mockReturnValue(true);
    vi.mocked(authApi.fetchPasskeys).mockResolvedValue([eins]);
    vi.mocked(authApi.passkeyEinrichten).mockResolvedValue(undefined);
    vi.mocked(authApi.passkeyEntfernen).mockResolvedValue(undefined);
  });

  it("listet eingerichtete Passkeys", async () => {
    renderWithProviders(<PasskeyAbschnitt />);
    expect(await screen.findByText("Mein Handy")).toBeInTheDocument();
  });

  it("richtet einen Passkey mit der gewählten Bezeichnung ein", async () => {
    renderWithProviders(<PasskeyAbschnitt />);
    await screen.findByText("Mein Handy");
    fireEvent.change(screen.getByLabelText("einstellungen.passkey.name"), {
      target: { value: "Laptop" },
    });
    fireEvent.click(screen.getByText("einstellungen.passkey.einrichten"));
    await waitFor(() => expect(authApi.passkeyEinrichten).toHaveBeenCalledWith("Laptop"));
    expect(await screen.findByText("einstellungen.passkey.erfolg")).toBeInTheDocument();
  });

  it("entfernt einen Passkey", async () => {
    renderWithProviders(<PasskeyAbschnitt />);
    await screen.findByText("Mein Handy");
    fireEvent.click(screen.getByText("einstellungen.passkey.entfernen"));
    await waitFor(() => expect(authApi.passkeyEntfernen).toHaveBeenCalledWith("p1"));
  });

  it("zeigt keinen Einrichten-Knopf, wenn das Gerät keine Passkeys kann", async () => {
    vi.mocked(passkeysUnterstuetzt).mockReturnValue(false);
    renderWithProviders(<PasskeyAbschnitt />);
    expect(await screen.findByText("einstellungen.passkey.nicht_unterstuetzt")).toBeInTheDocument();
    expect(screen.queryByText("einstellungen.passkey.einrichten")).not.toBeInTheDocument();
  });

  it("bleibt still, wenn der Benutzer den Geräte-Dialog abbricht", async () => {
    vi.mocked(authApi.passkeyEinrichten).mockRejectedValue(
      new DOMException("abgebrochen", "NotAllowedError"),
    );
    renderWithProviders(<PasskeyAbschnitt />);
    await screen.findByText("Mein Handy");
    fireEvent.click(screen.getByText("einstellungen.passkey.einrichten"));
    await waitFor(() => expect(authApi.passkeyEinrichten).toHaveBeenCalled());
    expect(screen.queryByText("einstellungen.passkey.fehler")).not.toBeInTheDocument();
  });
});
