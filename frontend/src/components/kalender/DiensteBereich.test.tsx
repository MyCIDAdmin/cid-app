import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useKalender";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Dienst } from "../../types/kalender";
import DiensteBereich from "./DiensteBereich";

vi.mock("../../hooks/useKalender", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useKalender");
  return {
    ...actual,
    useDienste: vi.fn(),
    useDienstAktion: vi.fn(),
    useDienstLoeschen: vi.fn(() => ({ mutateAsync: vi.fn() })),
    useDienstErstellen: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useDienstAnschreiben: vi.fn(() => ({ mutateAsync: vi.fn() })),
    usePersonenSuche: vi.fn(() => ({ data: [] })),
    useDienstVorschlaege: vi.fn(() => ({ data: [] })),
  };
});
vi.mock("../../hooks/useFaehigkeiten", () => ({ useFaehigkeitenKatalog: () => ({ data: [] }) }));

function dienst(extra: Partial<Dienst> = {}): Dienst {
  return {
    id: "d1",
    termin: null,
    termin_titel: "",
    evenement: "e1",
    evenement_titel: "Sommerfest",
    titel: "Aufbau",
    beschreibung: "",
    beginn: new Date(2026, 10, 1, 14).toISOString(),
    ende: new Date(2026, 10, 1, 16).toISOString(),
    benoetigt: 3,
    faehigkeit: null,
    faehigkeit_name: "",
    austragen_bis: null,
    erinnerung_stunden: 24,
    besetzt: 2,
    frei: 1,
    ich_eingetragen: false,
    eingetragen: [],
    ...extra,
  };
}

const eintragen = vi.fn().mockResolvedValue({});

beforeEach(() => {
  eintragen.mockClear();
  vi.mocked(hooks.useDienstAktion).mockReturnValue({
    mutateAsync: eintragen,
  } as unknown as ReturnType<typeof hooks.useDienstAktion>);
});

function mitDiensten(liste: Dienst[]) {
  vi.mocked(hooks.useDienste).mockReturnValue({
    data: liste,
  } as unknown as ReturnType<typeof hooks.useDienste>);
}

describe("DiensteBereich", () => {
  it("zeigt die Besetzung und trägt per Klick ein", () => {
    mitDiensten([dienst()]);
    renderWithProviders(<DiensteBereich evenement="e1" schreiben={false} />);
    expect(screen.getByText("dienste.besetzung")).toBeInTheDocument();
    fireEvent.click(screen.getByText("dienste.eintragen"));
    expect(eintragen).toHaveBeenCalledWith({ id: "d1", aktion: "eintragen" });
  });

  it("bietet bei eigener Eintragung nur Austragen an", () => {
    mitDiensten([dienst({ ich_eingetragen: true })]);
    renderWithProviders(<DiensteBereich evenement="e1" schreiben={false} />);
    expect(screen.queryByText("dienste.eintragen")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("dienste.austragen"));
    expect(eintragen).toHaveBeenCalledWith({ id: "d1", aktion: "austragen" });
  });

  it("blendet volle Dienste ohne Eintragen-Knopf aus", () => {
    mitDiensten([dienst({ besetzt: 3, frei: 0 })]);
    renderWithProviders(<DiensteBereich evenement="e1" schreiben={false} />);
    expect(screen.queryByText("dienste.eintragen")).not.toBeInTheDocument();
  });

  it("zeigt ohne Dienste und ohne Schreibrecht nichts", () => {
    mitDiensten([]);
    renderWithProviders(<DiensteBereich evenement="e1" schreiben={false} />);
    expect(screen.queryByTestId("dienste-bereich")).not.toBeInTheDocument();
  });

  it("zeigt mit Schreibrecht „Dienst hinzufügen“ und Personen", () => {
    mitDiensten([dienst()]);
    renderWithProviders(<DiensteBereich evenement="e1" schreiben />);
    expect(screen.getByText("dienste.hinzufuegen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("dienste.personen"));
    expect(screen.getByPlaceholderText("dienste.person_zuweisen")).toBeInTheDocument();
  });
});
