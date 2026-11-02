import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Reglement, Wahl } from "../../types/wahlen";
import ReglementTab from "./ReglementTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return {
    ...actual,
    useReglemente: vi.fn(),
    useReglementAnlegen: vi.fn(),
    useReglementAktionen: vi.fn(),
  };
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });
const wahl = (ausschuss: boolean) =>
  ({ id: "w1", ist_ausschuss: ausschuss, kann_verwalten: false }) as Wahl;

function reglement(extra: Partial<Reglement> = {}): Reglement {
  return {
    id: "r1",
    schluessel: "wahlordnung",
    version: "1.0",
    gueltig_ab: null,
    texte: { de: "<p>Die Wahl ist geheim.</p>" },
    geprueft: { fr: false, ar: false },
    gelesen: false,
    ...extra,
  };
}

function vorbereiten(liste: Reglement[]) {
  const aktionen = {
    aendern: mutation(),
    uebersetzen: mutation(),
    geprueft: mutation(),
    gelesen: mutation(),
  };
  const anlegen = mutation();
  vi.mocked(hooks.useReglemente).mockReturnValue({
    data: liste,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useReglemente>);
  vi.mocked(hooks.useReglementAnlegen).mockReturnValue(
    anlegen as unknown as ReturnType<typeof hooks.useReglementAnlegen>,
  );
  vi.mocked(hooks.useReglementAktionen).mockReturnValue(
    aktionen as unknown as ReturnType<typeof hooks.useReglementAktionen>,
  );
  return { aktionen, anlegen };
}

describe("ReglementTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt den Leerzustand", () => {
    vorbereiten([]);
    renderWithProviders(<ReglementTab wahl={wahl(false)} />);
    expect(screen.getByText("reglement.leer")).toBeInTheDocument();
  });

  it("Mitglieder lesen das Dokument und bestätigen es, sehen aber keine Verwaltung", () => {
    const { aktionen } = vorbereiten([reglement()]);
    renderWithProviders(<ReglementTab wahl={wahl(false)} />);
    expect(screen.getByText("Die Wahl ist geheim.")).toBeInTheDocument();
    expect(screen.queryByText("reglement.bearbeiten")).not.toBeInTheDocument();
    expect(screen.queryByText("reglement.hinzufuegen")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("reglement.gelesen_bestaetigen"));
    expect(aktionen.gelesen.mutate).toHaveBeenCalled();
  });

  it("nach der Bestätigung steht nur noch der Haken da", () => {
    vorbereiten([reglement({ gelesen: true })]);
    renderWithProviders(<ReglementTab wahl={wahl(false)} />);
    expect(screen.queryByText("reglement.gelesen_bestaetigen")).not.toBeInTheDocument();
    expect(screen.getByText("reglement.gelesen_ja")).toBeInTheDocument();
  });

  it("schädliches HTML wird nicht ausgegeben", () => {
    vorbereiten([reglement({ texte: { de: '<p>Text</p><img src=x onerror="alert(1)">' } })]);
    const { container } = renderWithProviders(<ReglementTab wahl={wahl(false)} />);
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("Übersetzungen sind als maschinell markiert, bis sie geprüft sind", () => {
    vorbereiten([reglement({ texte: { de: "<p>A</p>", fr: "<p>B</p>" } })]);
    renderWithProviders(<ReglementTab wahl={wahl(false)} />);
    fireEvent.click(screen.getByText("sprache.fr"));
    expect(screen.getByText("reglement.maschinell")).toBeInTheDocument();
  });

  it("der Ausschuss sieht die Anzahl Bestätigungen und kann fehlende Dokumente anlegen", () => {
    const { anlegen } = vorbereiten([reglement({ gelesen_anzahl: 7 })]);
    renderWithProviders(<ReglementTab wahl={wahl(true)} />);
    expect(screen.getByText("reglement.gelesen_anzahl")).toBeInTheDocument();
    expect(screen.queryByText("reglement.gelesen_bestaetigen")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("+ reglement.art.satzung"));
    expect(anlegen.mutate).toHaveBeenCalledWith("satzung", expect.anything());
    expect(screen.queryByText("+ reglement.art.wahlordnung")).not.toBeInTheDocument();
  });
});
