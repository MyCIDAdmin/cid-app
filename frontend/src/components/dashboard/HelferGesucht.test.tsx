import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useProjets";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { ProjetStelle } from "../../types/projets";
import HelferGesucht from "./HelferGesucht";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useProjets");
  return { ...actual, useOffeneStellen: vi.fn() };
});

const stelle = (o: Partial<ProjetStelle>) =>
  ({
    id: "s",
    projet: null,
    projet_titre: null,
    titel: "Titel",
    created_at: "2026-11-01T10:00:00Z",
    kategorie_detail: null,
    ...o,
  }) as ProjetStelle;

function mit(daten: ProjetStelle[]) {
  vi.mocked(hooks.useOffeneStellen).mockReturnValue({ data: daten } as never);
}
afterEach(() => cleanup());

describe("HelferGesucht", () => {
  it("erscheint ohne offene Gesuche gar nicht", () => {
    mit([]);
    renderWithProviders(<HelferGesucht />);
    expect(screen.queryByTestId("dashboard-stellen")).toBeNull();
  });

  it("zeigt Anzahl, die jüngsten drei und führt zum Tab Hilfe gesucht", () => {
    mit([
      stelle({ id: "1", titel: "Alt", created_at: "2026-10-01T10:00:00Z" }),
      stelle({ id: "2", titel: "Neu", created_at: "2026-11-09T10:00:00Z" }),
      stelle({ id: "3", titel: "Mittel", created_at: "2026-11-05T10:00:00Z" }),
      stelle({ id: "4", titel: "Mittel 2", created_at: "2026-11-02T10:00:00Z" }),
    ]);
    renderWithProviders(<HelferGesucht />);
    const kachel = screen.getByTestId("dashboard-stellen");
    expect(kachel).toHaveTextContent("stellen.anzahl");
    expect(kachel).toHaveTextContent("Neu");
    expect(kachel).not.toHaveTextContent("Alt");
    expect(kachel).toHaveTextContent("stellen.weitere");
    expect(kachel.querySelector("a[href='/projets?tab=hilfe']")).not.toBeNull();
  });

  it("verlinkt Projekt-Stellen zum Projekt und freie Gesuche zum Tab", () => {
    mit([
      stelle({ id: "1", titel: "Web", projet: "p1", projet_titre: "Vereinsheim" }),
      stelle({ id: "2", titel: "Stand" }),
    ]);
    renderWithProviders(<HelferGesucht />);
    const kachel = screen.getByTestId("dashboard-stellen");
    expect(kachel.querySelector("a[href='/projets/p1']")).not.toBeNull();
    expect(kachel).toHaveTextContent("Vereinsheim");
    expect(kachel).toHaveTextContent("stellen.vom_verein");
  });

  it("trägt die Animations-Klassen (Bewegung wird per CSS bei reduzierter Bewegung abgeschaltet)", () => {
    mit([stelle({ id: "1" })]);
    renderWithProviders(<HelferGesucht />);
    expect(screen.getByTestId("dashboard-stellen").className).toContain("helfer-kachel");
  });
});
