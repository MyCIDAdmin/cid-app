import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Einspruch, Wahl } from "../../types/wahlen";
import EinsprueceTab from "./EinsprueceTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return { ...actual, useEinsprueche: vi.fn(), useEinspruchAktionen: vi.fn() };
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });
const wahl = (ausschuss: boolean) =>
  ({ id: "w1", ist_ausschuss: ausschuss, kann_verwalten: false, zustimmungen_noetig: 2 }) as Wahl;

function einspruch(extra: Partial<Einspruch> = {}): Einspruch {
  return {
    id: "e1",
    wahl: "w1",
    art: "ergebnis",
    kandidatur: null,
    kandidatur_name: "",
    text: "Die Zählung war fehlerhaft.",
    status: "offen",
    created_at: "2026-11-21T10:00:00Z",
    entscheiden_bis: "2026-11-26T10:00:00Z",
    begruendung: "",
    entschieden_am: null,
    ...extra,
  };
}

function vorbereiten(liste: Einspruch[]) {
  vi.mocked(hooks.useEinsprueche).mockReturnValue({
    data: liste,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useEinsprueche>);
  vi.mocked(hooks.useEinspruchAktionen).mockReturnValue({
    aktion: mutation(),
    entscheiden: mutation(),
  } as unknown as ReturnType<typeof hooks.useEinspruchAktionen>);
}

describe("EinsprueceTab", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: { id: "u1", email: "a@example.de", role: "membre", langue_preferee: "de" },
      isAuthenticated: true,
    });
  });

  it("zeigt den Leerzustand", () => {
    vorbereiten([]);
    renderWithProviders(<EinsprueceTab wahl={wahl(false)} />);
    expect(screen.getByText("einspruch.leer")).toBeInTheDocument();
  });

  it("Einreicher*in kann zurückziehen, sieht aber keine Entscheidungsfelder", () => {
    vorbereiten([einspruch()]);
    renderWithProviders(<EinsprueceTab wahl={wahl(false)} />);
    expect(screen.getByText("einspruch.zurueckziehen")).toBeInTheDocument();
    expect(screen.queryByLabelText("einspruch.begruendung")).not.toBeInTheDocument();
  });

  it("der Ausschuss schlägt vor, ohne Begründung ist die Schaltfläche gesperrt", () => {
    vorbereiten([einspruch({ einreicher: "Erika Muster", vorschlag: "" })]);
    renderWithProviders(<EinsprueceTab wahl={wahl(true)} />);
    expect(screen.getByText("Erika Muster")).toBeInTheDocument();
    expect(screen.getByText("einspruch.abweisen")).toBeDisabled();
    expect(screen.queryByText("einspruch.zurueckziehen")).not.toBeInTheDocument();
  });

  it("bei offenem Vorschlag kann nur eine andere Person zustimmen", () => {
    const e = einspruch({
      vorschlag: "abweisen",
      vorschlag_begruendung: "Kein Fehler",
      zustimmungen: ["u1"],
      zustimmungen_noetig: 2,
    });
    vorbereiten([e]);
    const { unmount } = renderWithProviders(<EinsprueceTab wahl={wahl(true)} />);
    expect(screen.queryByText("einspruch.zustimmen")).not.toBeInTheDocument();
    unmount();
    vorbereiten([{ ...e, zustimmungen: ["u2"] }]);
    renderWithProviders(<EinsprueceTab wahl={wahl(true)} />);
    expect(screen.getByText("einspruch.zustimmen")).toBeInTheDocument();
  });

  it("entschiedene Einsprüche zeigen die Begründung", () => {
    vorbereiten([einspruch({ status: "abgewiesen", begruendung: "Nachgezählt, alles korrekt." })]);
    renderWithProviders(<EinsprueceTab wahl={wahl(false)} />);
    expect(screen.getByText("Nachgezählt, alles korrekt.")).toBeInTheDocument();
    expect(screen.queryByText("einspruch.zurueckziehen")).not.toBeInTheDocument();
  });
});
