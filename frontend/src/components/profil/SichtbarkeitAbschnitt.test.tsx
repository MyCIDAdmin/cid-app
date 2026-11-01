import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../../api/auth";
import { useAuthStore, type CidUser } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import SichtbarkeitAbschnitt from "./SichtbarkeitAbschnitt";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, speicherePraeferenzen: vi.fn() };
});

function user(o: Partial<CidUser> = {}): CidUser {
  return { id: "u", email: "a@b.de", role: "membre", ist_fan: false, ...o } as CidUser;
}

describe("SichtbarkeitAbschnitt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: user() });
  });

  it("ist standardmäßig aus und speichert die Zustimmung", async () => {
    vi.mocked(authApi.speicherePraeferenzen).mockResolvedValue(
      user({ ui_praeferenzen: { neu_dabei_zeigen: true } }),
    );
    renderWithProviders(<SichtbarkeitAbschnitt />);

    const haken = screen.getByRole("checkbox");
    expect(haken).not.toBeChecked();
    fireEvent.click(haken);

    await waitFor(() =>
      expect(authApi.speicherePraeferenzen).toHaveBeenCalledWith({
        ui_praeferenzen: { neu_dabei_zeigen: true },
      }),
    );
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
  });

  it("nimmt die Zustimmung wieder zurück", async () => {
    useAuthStore.setState({ user: user({ ui_praeferenzen: { neu_dabei_zeigen: true } }) });
    vi.mocked(authApi.speicherePraeferenzen).mockResolvedValue(user());
    renderWithProviders(<SichtbarkeitAbschnitt />);

    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() =>
      expect(authApi.speicherePraeferenzen).toHaveBeenCalledWith({
        ui_praeferenzen: { neu_dabei_zeigen: false },
      }),
    );
  });

  it("zeigt einen Fehler, wenn das Speichern scheitert", async () => {
    vi.mocked(authApi.speicherePraeferenzen).mockRejectedValue(new Error("x"));
    renderWithProviders(<SichtbarkeitAbschnitt />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("ist für Fan-Konten nicht sichtbar", () => {
    useAuthStore.setState({ user: user({ ist_fan: true }) });
    const { container } = renderWithProviders(<SichtbarkeitAbschnitt />);
    expect(container).toBeEmptyDOMElement();
  });
});
