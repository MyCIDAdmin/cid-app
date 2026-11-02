import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useBoutiqueHooks from "../../hooks/useBoutique";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Aufgabe, VerwaltungUeberblick } from "../../types/boutique";
import UeberblickTab from "./UeberblickTab";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useVerwaltungUeberblick: vi.fn() };
});

function aufgabe(teil: Partial<Aufgabe> & Pick<Aufgabe, "id" | "art">): Aufgabe {
  return {
    anzahl: 2,
    tage: 8,
    schwere: "rot",
    rolle: "finanz",
    darf: true,
    ziel: { tab: "bestellungen", stapel: "zahlung_offen" },
    daten: {},
    ...teil,
  };
}

function daten(teil: Partial<VerwaltungUeberblick> = {}): VerwaltungUeberblick {
  return {
    stand: "2026-11-02T08:00:00Z",
    kann_finanz: true,
    kann_buero: true,
    schwellen: { zahlung_tage: 7, versand_tage: 5, unterwegs_tage: 5 },
    kacheln: {
      zahlung_offen: { anzahl: 2, aeltest_tage: 8, ton: "rot" },
      zu_versenden: { anzahl: 0, aeltest_tage: null, ton: "gruen" },
      reservierungen_offen: { anzahl: 5, aeltest_tage: null, ton: "rot" },
      katalog_hinweise: { anzahl: 1, aeltest_tage: null, ton: "orange" },
    },
    aufgaben: [],
    stapel: { zahlung_offen: 2, zu_versenden: 0, unterwegs: 0, erledigt: 0, abgebrochen: 0 },
    hinweise: {},
    ...teil,
  };
}

function zeige(d: VerwaltungUeberblick | null, extra: Record<string, unknown> = {}) {
  vi.mocked(useBoutiqueHooks.useVerwaltungUeberblick).mockReturnValue({
    data: d ?? undefined,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useBoutiqueHooks.useVerwaltungUeberblick>);
}

describe("UeberblickTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("öffnet beim Klick auf eine Kachel den passenden Stapel", () => {
    zeige(daten());
    const onZiel = vi.fn();
    renderWithProviders(<UeberblickTab onZiel={onZiel} />);
    fireEvent.click(screen.getByText("ueberblick.kacheln.zahlung_offen"));
    expect(onZiel).toHaveBeenCalledWith({ tab: "bestellungen", stapel: "zahlung_offen" });
    fireEvent.click(screen.getByText("ueberblick.kacheln.katalog"));
    expect(onZiel).toHaveBeenCalledWith({ tab: "katalog", filter: "hinweise" });
    fireEvent.click(screen.getByText("ueberblick.kacheln.reservierungen"));
    expect(onZiel).toHaveBeenCalledWith({ tab: "reservierungen" });
  });

  it("zeigt Aufgaben und führt mit dem Knopf zur Liste", () => {
    zeige(daten({ aufgaben: [aufgabe({ id: "zahlung", art: "zahlung" })] }));
    const onZiel = vi.fn();
    renderWithProviders(<UeberblickTab onZiel={onZiel} />);
    fireEvent.click(screen.getByText("ueberblick.aufgaben.zahlung.knopf"));
    expect(onZiel).toHaveBeenCalledWith({ tab: "bestellungen", stapel: "zahlung_offen" });
  });

  it("verbirgt Aufgaben anderer Rollen hinter einem Schalter", () => {
    zeige(
      daten({
        aufgaben: [
          aufgabe({ id: "zahlung", art: "zahlung", darf: false }),
          aufgabe({
            id: "katalog",
            art: "katalog",
            rolle: "buero",
            schwere: "orange",
            tage: null,
            ziel: { tab: "katalog", filter: "hinweise" },
            daten: { namen: ["Heimtrikot"] },
          }),
        ],
      }),
    );
    renderWithProviders(<UeberblickTab onZiel={vi.fn()} />);
    expect(screen.queryByText("ueberblick.aufgaben.zahlung.knopf")).not.toBeInTheDocument();
    expect(screen.getByText("ueberblick.aufgaben.katalog.knopf")).toBeInTheDocument();

    fireEvent.click(screen.getByText("ueberblick.andere_an"));
    expect(screen.getByText("ueberblick.aufgaben.zahlung.knopf")).toBeInTheDocument();
  });

  it("meldet, wenn nichts zu tun ist", () => {
    zeige(daten({ aufgaben: [] }));
    renderWithProviders(<UeberblickTab onZiel={vi.fn()} />);
    expect(screen.getByText("ueberblick.alles_erledigt")).toBeInTheDocument();
  });

  it("blendet Erklärungen mit dem Schalter aus", () => {
    zeige(daten());
    renderWithProviders(<UeberblickTab onZiel={vi.fn()} />);
    expect(screen.getByText("ueberblick.ampel_hilfe")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByText("ueberblick.ampel_hilfe")).not.toBeInTheDocument();
  });

  it("zeigt einen Fehlertext, wenn der Überblick nicht lädt", () => {
    zeige(null, { isError: true });
    renderWithProviders(<UeberblickTab onZiel={vi.fn()} />);
    expect(screen.getByText("ueberblick.fehler")).toBeInTheDocument();
  });
});
