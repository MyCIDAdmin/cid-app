import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Kandidatur, Wahl } from "../../types/wahlen";
import PruefverfahrenTab from "./PruefverfahrenTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return { ...actual, useKandidaturen: vi.fn(), useKandidaturAktionen: vi.fn() };
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });
const wahl = { id: "w1", ist_ausschuss: true, zustimmungen_noetig: 2 } as unknown as Wahl;

function kandidatur(zustimmungen: string[]): Kandidatur {
  return {
    id: "k1",
    name: "Liste Beispiel",
    leitsatz: "",
    vorstellung: "",
    programm: [],
    sprache: "de",
    status: "eingereicht",
    einreicher: "Erika Muster",
    personen: [],
    nachweise: [],
    pruefpunkte: [{ schluessel: "foto", automatisch: false, ergebnis: "offen", notiz: "" }],
    entscheidung_offen: {
      id: "e1",
      art: "zulassen",
      begruendung: "",
      artikel: "",
      vorgeschlagen_von: "u1",
      zustimmungen,
      umgesetzt_am: null,
      created_at: "2026-11-01T10:00:00Z",
    },
  } as unknown as Kandidatur;
}

function vorbereiten(k: Kandidatur) {
  vi.mocked(hooks.useKandidaturen).mockReturnValue({
    data: [k],
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useKandidaturen>);
  vi.mocked(hooks.useKandidaturAktionen).mockReturnValue({
    aendern: mutation(),
    foto: mutation(),
    nachweis: mutation(),
    aktion: mutation(),
    pruefpunkt: mutation(),
    entscheidung: mutation(),
    entscheidungAntwort: mutation(),
  } as unknown as ReturnType<typeof hooks.useKandidaturAktionen>);
}

describe("PruefverfahrenTab", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: { id: "u1", email: "a@example.de", role: "membre", langue_preferee: "de" },
      isAuthenticated: true,
    });
  });

  it("wer schon zugestimmt hat, kann nicht noch einmal zustimmen", () => {
    vorbereiten(kandidatur(["u1"]));
    renderWithProviders(<PruefverfahrenTab wahl={wahl} />);
    expect(screen.getByTestId("entscheidung-offen")).toBeInTheDocument();
    expect(screen.queryByText("pruefung.zustimmen")).not.toBeInTheDocument();
  });

  it("ein anderes Ausschussmitglied kann zustimmen", () => {
    vorbereiten(kandidatur(["u2"]));
    renderWithProviders(<PruefverfahrenTab wahl={wahl} />);
    expect(screen.getByText("pruefung.zustimmen")).toBeInTheDocument();
  });

  it("zeigt den Leerzustand ohne Eingänge", () => {
    vi.mocked(hooks.useKandidaturen).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useKandidaturen>);
    renderWithProviders(<PruefverfahrenTab wahl={wahl} />);
    expect(screen.getByText("pruefung.leer")).toBeInTheDocument();
  });
});
