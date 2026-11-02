import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import type { Wahl } from "../../types/wahlen";
import { renderWithProviders } from "../../test/renderWithProviders";
import WahlenPage from "./WahlenPage";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return { ...actual, useWahlen: vi.fn(), useWahlAnlegen: vi.fn() };
});

const nutzer = {
  id: "u1",
  email: "m@example.de",
  role: "membre" as const,
  langue_preferee: "de" as const,
};

const wahl = {
  id: "w1",
  titel: "Wahl des Beispiel-Ausschusses",
  form: "liste",
  status: "aktiv",
  phase: 1,
  phase_name: "kandidatur",
  termine: { wahl_von: "2026-12-01T09:00:00Z", wahl_bis: "2026-12-08T20:00:00Z" },
} as unknown as Wahl;

function mitWahlen(data: Wahl[]) {
  vi.mocked(hooks.useWahlen).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useWahlen>);
  vi.mocked(hooks.useWahlAnlegen).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useWahlAnlegen>);
}

describe("WahlenPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: nutzer,
      isAuthenticated: true,
    });
  });

  it("zeigt die Wahlen mit Phase und Link", () => {
    mitWahlen([wahl]);
    renderWithProviders(<WahlenPage />);
    expect(screen.getByText("Wahl des Beispiel-Ausschusses")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wahl des Beispiel-Ausschusses/ })).toHaveAttribute(
      "href",
      "/wahlen/w1",
    );
  });

  it("zeigt den Leerzustand", () => {
    mitWahlen([]);
    renderWithProviders(<WahlenPage />);
    expect(screen.getByText("leer")).toBeInTheDocument();
  });

  it("ein Mitglied kann keine Wahl anlegen", () => {
    mitWahlen([wahl]);
    renderWithProviders(<WahlenPage />);
    expect(screen.queryByText("neu")).not.toBeInTheDocument();
  });

  it("das Büro sieht den Knopf zum Anlegen, auch ohne Wahlen", () => {
    useAuthStore.setState({ user: { ...nutzer, role: "bureau_admin" } });
    mitWahlen([]);
    renderWithProviders(<WahlenPage />);
    expect(screen.getByText("neu")).toBeInTheDocument();
  });
});
