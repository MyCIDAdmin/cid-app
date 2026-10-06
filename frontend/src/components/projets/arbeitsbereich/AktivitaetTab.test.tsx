import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../../hooks/useProjets";
import { renderWithProviders } from "../../../test/renderWithProviders";
import type { AktivitaetEintrag } from "../../../types/projets";
import AktivitaetTab from "./AktivitaetTab";

vi.mock("../../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../../hooks/useProjets");
  return { ...actual, useAktivitaeten: vi.fn() };
});

function eintrag(overrides: Partial<AktivitaetEintrag>): AktivitaetEintrag {
  return {
    id: "e1",
    projet: "p1",
    zeitpunkt: "2026-10-07T09:00:00Z",
    akteur_name: "Amel Ben",
    aktion: "aufgabe_erstellt",
    objekt: "Flyer",
    detail: "",
    ...overrides,
  };
}

function mockAbfrage(daten: AktivitaetEintrag[], zustand: Record<string, boolean> = {}) {
  vi.mocked(hooks.useAktivitaeten).mockReturnValue({
    data: daten,
    isLoading: false,
    isError: false,
    ...zustand,
  } as unknown as ReturnType<typeof hooks.useAktivitaeten>);
}

describe("AktivitaetTab", () => {
  beforeEach(() => vi.mocked(hooks.useAktivitaeten).mockReset());

  it("zeigt je Aktion einen Eintrag mit übersetzten Platzhaltern", () => {
    mockAbfrage([
      eintrag({ id: "1" }),
      eintrag({ id: "2", aktion: "aufgabe_verschoben", detail: "offen>in_arbeit" }),
      eintrag({ id: "3", aktion: "team_rolle", objekt: "Karim", detail: "beobachter" }),
      eintrag({ id: "4", aktion: "kosten_erfasst", objekt: "Baumarkt", detail: "12.50" }),
      eintrag({ id: "5", aktion: "sichtbarkeit", detail: "veroeffentlicht" }),
    ]);
    renderWithProviders(<AktivitaetTab projetId="p1" />);
    // Tests laufen mit rohen i18n-Schlüsseln (siehe setupTests) : je Eintrag ein Satz-Schlüssel.
    expect(
      screen.getByText("arbeitsbereich.aktivitaet.aktion.aufgabe_erstellt"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("arbeitsbereich.aktivitaet.aktion.aufgabe_verschoben"),
    ).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.aktivitaet.aktion.team_rolle")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.aktivitaet.aktion.kosten_erfasst")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.aktivitaet.aktion.sichtbarkeit")).toBeInTheDocument();
  });

  it("zeigt Leer- und Fehlerzustand", () => {
    mockAbfrage([]);
    const { unmount } = renderWithProviders(<AktivitaetTab projetId="p1" />);
    expect(screen.getByText("arbeitsbereich.aktivitaet.leer")).toBeInTheDocument();
    unmount();
    mockAbfrage([], { isError: true });
    renderWithProviders(<AktivitaetTab projetId="p1" />);
    expect(screen.getByText("arbeitsbereich.aktivitaet.fehler")).toBeInTheDocument();
  });
});
