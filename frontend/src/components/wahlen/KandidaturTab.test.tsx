import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Kandidatur, Wahl } from "../../types/wahlen";
import KandidaturTab from "./KandidaturTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return {
    ...actual,
    useKandidaturen: vi.fn(),
    useKandidaturAnlegen: vi.fn(),
    useKandidaturAktionen: vi.fn(),
  };
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });

const wahl = {
  id: "w1",
  titel: "Beispielwahl",
  form: "person",
  status: "aktiv",
  phase: 1,
  ist_ausschuss: false,
  meine_kandidatur: null,
  listen_groesse: 3,
  unterstuetzungen_noetig: 10,
} as unknown as Wahl;

const kandidatur = {
  id: "k1",
  name: "",
  leitsatz: "",
  vorstellung: "",
  programm: [],
  sprache: "de",
  status: "entwurf",
  fehlend: ["foto", "programm"],
  unterstuetzungen: 3,
  personen: [
    {
      id: "p1",
      membre: "m1",
      name: "Erika Muster",
      amt: "cand",
      foto: null,
      waehlbarkeit: {
        aktiv_beitrag: true,
        jahre: 4,
        jahre_noetig: 2,
        dauer_ok: true,
        kein_ausschuss: true,
      },
    },
  ],
  nachweise: [],
} as unknown as Kandidatur;

function vorbereiten(einreichen = vi.fn()) {
  vi.mocked(hooks.useKandidaturAnlegen).mockReturnValue(
    mutation() as unknown as ReturnType<typeof hooks.useKandidaturAnlegen>,
  );
  vi.mocked(hooks.useKandidaturAktionen).mockReturnValue({
    aendern: mutation(),
    foto: mutation(),
    nachweis: mutation(),
    aktion: { mutate: einreichen, isPending: false },
    pruefpunkt: mutation(),
    entscheidung: mutation(),
    entscheidungAntwort: mutation(),
  } as unknown as ReturnType<typeof hooks.useKandidaturAktionen>);
}

describe("KandidaturTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bietet das Anlegen nur in der Kandidaturphase an", () => {
    vorbereiten();
    vi.mocked(hooks.useKandidaturen).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof hooks.useKandidaturen>);
    const { unmount } = renderWithProviders(<KandidaturTab wahl={wahl} />);
    expect(screen.getByText("kandidatur.starten")).toBeInTheDocument();
    unmount();
    renderWithProviders(<KandidaturTab wahl={{ ...wahl, phase: 3 }} />);
    expect(screen.queryByText("kandidatur.starten")).not.toBeInTheDocument();
    expect(screen.getByText("kandidatur.nicht_moeglich")).toBeInTheDocument();
  });

  it("zeigt Wählbarkeit und offene Punkte; Einreichen ist gesperrt, solange etwas fehlt", () => {
    vorbereiten();
    vi.mocked(hooks.useKandidaturen).mockReturnValue({
      data: [kandidatur],
    } as unknown as ReturnType<typeof hooks.useKandidaturen>);
    renderWithProviders(<KandidaturTab wahl={{ ...wahl, meine_kandidatur: "k1" }} />);
    expect(screen.getByTestId("waehlbarkeit")).toBeInTheDocument();
    expect(screen.getByTestId("fehlend")).toBeInTheDocument();
    expect(screen.getByText("kandidatur.einreichen")).toBeDisabled();
  });

  it("reicht ein, wenn nichts mehr fehlt", () => {
    const aktion = vi.fn();
    vorbereiten(aktion);
    vi.mocked(hooks.useKandidaturen).mockReturnValue({
      data: [{ ...kandidatur, fehlend: [] }],
    } as unknown as ReturnType<typeof hooks.useKandidaturen>);
    renderWithProviders(<KandidaturTab wahl={{ ...wahl, meine_kandidatur: "k1" }} />);
    fireEvent.click(screen.getByText("kandidatur.einreichen"));
    expect(aktion).toHaveBeenCalledWith("einreichen", expect.anything());
  });

  it("eingereichte Kandidaturen sind schreibgeschützt", () => {
    vorbereiten();
    vi.mocked(hooks.useKandidaturen).mockReturnValue({
      data: [{ ...kandidatur, status: "eingereicht", fehlend: [] }],
    } as unknown as ReturnType<typeof hooks.useKandidaturen>);
    renderWithProviders(<KandidaturTab wahl={{ ...wahl, meine_kandidatur: "k1" }} />);
    expect(screen.queryByText("kandidatur.einreichen")).not.toBeInTheDocument();
    expect(screen.getByLabelText("kandidatur.leitsatz")).toBeDisabled();
  });
});
