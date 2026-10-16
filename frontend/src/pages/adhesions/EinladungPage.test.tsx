import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import { useAuthStore } from "../../store/authStore";
import type { Einladung } from "../../types/adhesion";
import EinladungPage from "./EinladungPage";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useEinladung: vi.fn(),
    useEinladungAnnehmen: vi.fn(),
    useEinladungAblehnen: vi.fn(),
  };
});

const einladung: Einladung = {
  token: "tok",
  hauptperson: "Anna Muster",
  kampagne: "2026",
  angebot: "CID-PLUS",
  vorname: "Max",
  nachname: "Muster",
  email: "max@example.de",
  beziehung: "ehepartner",
  status: "eingeladen",
  bezahlt: true,
  konto_vorhanden: false,
};

const annehmen = vi.fn();
const ablehnen = vi.fn();

function setup(e: Einladung) {
  vi.mocked(useAdhesionsHooks.useEinladung).mockReturnValue({
    data: e,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useAdhesionsHooks.useEinladung>);
  vi.mocked(useAdhesionsHooks.useEinladungAnnehmen).mockReturnValue({
    mutate: annehmen,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAdhesionsHooks.useEinladungAnnehmen>);
  vi.mocked(useAdhesionsHooks.useEinladungAblehnen).mockReturnValue({
    mutate: ablehnen,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAdhesionsHooks.useEinladungAblehnen>);
  return renderWithProviders(<EinladungPage />, {
    route: "/einladung/tok",
    path: "/einladung/:token",
  });
}

describe("EinladungPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it("ohne Konto: Link zur Registrierung mit Token", () => {
    setup(einladung);
    const link = screen.getByText("einladung.konto_erstellen").closest("a");
    expect(link?.getAttribute("href")).toBe("/register?einladung=tok");
  });

  it("mit Konto, nicht angemeldet: Anmelden", () => {
    setup({ ...einladung, konto_vorhanden: true, status: "zustimmung_offen" });
    expect(screen.getByText("einladung.anmelden")).toBeInTheDocument();
    expect(screen.queryByText("einladung.annehmen")).not.toBeInTheDocument();
  });

  it("richtiges Konto angemeldet: Annehmen ruft die Mutation auf", () => {
    useAuthStore.setState({
      user: { email: "MAX@example.de" } as never,
      isAuthenticated: true,
    });
    setup({ ...einladung, konto_vorhanden: true, status: "zustimmung_offen" });
    fireEvent.click(screen.getByText("einladung.annehmen"));
    expect(annehmen).toHaveBeenCalled();
  });

  it("falsches Konto: kein Annehmen", () => {
    useAuthStore.setState({
      user: { email: "andere@example.de" } as never,
      isAuthenticated: true,
    });
    setup({ ...einladung, konto_vorhanden: true, status: "zustimmung_offen" });
    expect(screen.queryByText("einladung.annehmen")).not.toBeInTheDocument();
    expect(screen.getByText("einladung.anderes_konto")).toBeInTheDocument();
  });

  it("Ablehnen ohne Anmeldung möglich", () => {
    setup(einladung);
    fireEvent.click(screen.getByText("einladung.ablehnen"));
    expect(ablehnen).toHaveBeenCalled();
  });
});
