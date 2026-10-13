import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../../api/auth";
import { useAuthStore, type CidUser } from "../../store/authStore";
import WochenmailSchalter from "./WochenmailSchalter";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("../../api/auth", async (orig) => {
  const actual = await orig<typeof import("../../api/auth")>();
  return { ...actual, speicherePraeferenzen: vi.fn() };
});

function nutzer(an: boolean): CidUser {
  return {
    id: "u1",
    email: "a@example.de",
    role: "membre",
    langue_preferee: "de",
    ui_praeferenzen: { kalender_wochenmail: an },
  } as CidUser;
}

describe("WochenmailSchalter", () => {
  beforeEach(() => {
    vi.mocked(authApi.speicherePraeferenzen).mockReset();
    useAuthStore.setState({ user: nutzer(false) });
  });

  it("schaltet ein und speichert nur den Schalter", async () => {
    vi.mocked(authApi.speicherePraeferenzen).mockResolvedValue(nutzer(true));
    render(<WochenmailSchalter />);
    const box = screen.getByRole("checkbox");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    expect(authApi.speicherePraeferenzen).toHaveBeenCalledWith({
      ui_praeferenzen: { kalender_wochenmail: true },
    });
  });

  it("zeigt einen Fehler, wenn das Speichern scheitert", async () => {
    vi.mocked(authApi.speicherePraeferenzen).mockRejectedValue(new Error("x"));
    render(<WochenmailSchalter />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
