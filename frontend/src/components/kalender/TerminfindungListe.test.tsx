import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useKalender";
import type { Terminumfrage } from "../../types/kalender";
import TerminfindungListe from "./TerminfindungListe";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "de" } }),
}));
vi.mock("../../hooks/useKalender", () => ({
  useUmfragen: vi.fn(),
  useUmfrageAbstimmen: vi.fn(),
  useUmfrageEntscheiden: vi.fn(),
  useUmfrageAbbrechen: vi.fn(),
}));

const abstimmen = vi.fn().mockResolvedValue(undefined);
const entscheiden = vi.fn().mockResolvedValue(undefined);

function umfrage(extra: Partial<Terminumfrage> = {}): Terminumfrage {
  return {
    id: "u1",
    titel: "Vorstandssitzung November",
    beschreibung: "",
    ort: "Köln",
    dauer_minuten: 90,
    antwort_bis: null,
    status: "offen",
    erstellt_von_name: "Bureau",
    teilnehmer: [],
    optionen: [
      {
        id: "o1",
        beginn: "2026-11-05T18:00:00Z",
        ja: 1,
        vielleicht: 0,
        nein: 0,
        meine_antwort: null,
        stimmen: [],
      },
      {
        id: "o2",
        beginn: "2026-11-06T18:00:00Z",
        ja: 0,
        vielleicht: 1,
        nein: 0,
        meine_antwort: null,
        stimmen: [],
      },
    ],
    gewaehlt: null,
    termin: null,
    bin_teilnehmer: true,
    darf_entscheiden: false,
    ...extra,
  };
}

function daten(u: Terminumfrage[]) {
  vi.mocked(hooks.useUmfragen).mockReturnValue({
    data: u,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useUmfragen>);
}

describe("TerminfindungListe", () => {
  beforeEach(() => {
    abstimmen.mockClear();
    entscheiden.mockClear();
    vi.mocked(hooks.useUmfrageAbstimmen).mockReturnValue({
      mutateAsync: abstimmen,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useUmfrageAbstimmen>);
    vi.mocked(hooks.useUmfrageEntscheiden).mockReturnValue({
      mutateAsync: entscheiden,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useUmfrageEntscheiden>);
    vi.mocked(hooks.useUmfrageAbbrechen).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useUmfrageAbbrechen>);
  });

  it("zeigt nichts ohne offene Terminfindung", () => {
    daten([umfrage({ status: "entschieden" })]);
    const { container } = render(<TerminfindungListe />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sendet die gewählten Antworten", () => {
    daten([umfrage()]);
    render(<TerminfindungListe />);
    fireEvent.click(screen.getAllByText("findung.antwort.ja")[0]);
    fireEvent.click(screen.getAllByText("findung.antwort.nein")[1]);
    fireEvent.click(screen.getByText("findung.antwort_senden"));
    expect(abstimmen).toHaveBeenCalledWith({ id: "u1", stimmen: { o1: "ja", o2: "nein" } });
  });

  it("lässt das Bureau einen Termin wählen", () => {
    daten([umfrage({ darf_entscheiden: true, bin_teilnehmer: false })]);
    render(<TerminfindungListe />);
    expect(screen.queryByText("findung.antwort.ja")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText("findung.waehlen")[1]);
    expect(entscheiden).toHaveBeenCalledWith({ id: "u1", option: "o2" });
  });
});
