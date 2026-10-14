import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useKalender";
import type { Sitzung } from "../../types/kalender";
import SitzungsBereich from "./SitzungsBereich";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("../../hooks/useProjets", () => ({
  useProjets: () => ({ data: { results: [{ id: "p1", titre: "Fest" }] } }),
}));
vi.mock("../../hooks/useKalender", () => ({
  useSitzung: vi.fn(),
  useSitzungSpeichern: vi.fn(),
  useBeschlussErstellen: vi.fn(),
  useBeschlussLoeschen: vi.fn(),
  useBeschlussZuAufgabe: vi.fn(),
  useProtokollVersenden: vi.fn(),
  usePersonenSuche: vi.fn(() => ({ data: [] })),
}));

const speichern = vi.fn().mockResolvedValue(undefined);
const zuAufgabe = vi.fn().mockResolvedValue(undefined);
const versenden = vi.fn().mockResolvedValue(undefined);

function sitzung(extra: Partial<Sitzung> = {}): Sitzung {
  return {
    darf_bearbeiten: true,
    darf_protokoll_sehen: true,
    tops: [{ id: "t1", titel: "Begrüßung", beschreibung: "" }],
    protokoll: "Alle da.",
    versendet_am: null,
    beschluesse: [
      {
        id: "b1",
        top: null,
        text: "Flyer drucken",
        verantwortlich: null,
        verantwortlich_name: "",
        frist: null,
        aufgabe: null,
        projekt: null,
      },
    ],
    projekt: null,
    ...extra,
  };
}

function mocke(s: Sitzung) {
  const mut = (fn: unknown) => ({ mutateAsync: fn, isPending: false });
  vi.mocked(hooks.useSitzung).mockReturnValue({
    data: s,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useSitzung>);
  vi.mocked(hooks.useSitzungSpeichern).mockReturnValue(mut(speichern) as never);
  vi.mocked(hooks.useBeschlussErstellen).mockReturnValue(mut(vi.fn()) as never);
  vi.mocked(hooks.useBeschlussLoeschen).mockReturnValue(mut(vi.fn()) as never);
  vi.mocked(hooks.useBeschlussZuAufgabe).mockReturnValue(mut(zuAufgabe) as never);
  vi.mocked(hooks.useProtokollVersenden).mockReturnValue(mut(versenden) as never);
}

describe("SitzungsBereich", () => {
  beforeEach(() => {
    speichern.mockClear();
    zuAufgabe.mockClear();
    versenden.mockClear();
  });

  it("speichert das Protokoll", () => {
    mocke(sitzung());
    render(<SitzungsBereich terminId="t" />);
    fireEvent.change(screen.getByLabelText("sitzung.protokoll"), { target: { value: "Neu" } });
    fireEvent.click(screen.getAllByText("sitzung.speichern")[1]);
    expect(speichern).toHaveBeenCalledWith({ terminId: "t", v: { protokoll: "Neu" } });
  });

  it("wandelt einen Beschluss mit einem Projekt in eine Aufgabe um", () => {
    mocke(sitzung());
    render(<SitzungsBereich terminId="t" />);
    fireEvent.click(screen.getByText("sitzung.zur_aufgabe"));
    fireEvent.change(screen.getByLabelText("sitzung.projekt"), { target: { value: "p1" } });
    fireEvent.click(screen.getByText("sitzung.aufgabe_anlegen"));
    expect(zuAufgabe).toHaveBeenCalledWith({
      terminId: "t",
      beschlussId: "b1",
      projekt: "p1",
      verantwortlich: null,
      frist: null,
    });
  });

  it("versendet die Zusammenfassung", () => {
    mocke(sitzung());
    render(<SitzungsBereich terminId="t" />);
    fireEvent.click(screen.getByText(/sitzung.versenden/));
    expect(versenden).toHaveBeenCalledWith({ terminId: "t", v: undefined });
  });

  it("zeigt Eingeladenen nur lesend und ohne Bearbeiten", () => {
    mocke(sitzung({ darf_bearbeiten: false }));
    render(<SitzungsBereich terminId="t" />);
    expect(screen.getByText("Alle da.")).toBeInTheDocument();
    expect(screen.queryByText("sitzung.zur_aufgabe")).not.toBeInTheDocument();
    expect(screen.queryByText(/sitzung.versenden/)).not.toBeInTheDocument();
  });

  it("verbirgt Protokoll und Beschlüsse ohne Berechtigung", () => {
    mocke(
      sitzung({
        darf_bearbeiten: false,
        darf_protokoll_sehen: false,
        protokoll: "",
        beschluesse: [],
      }),
    );
    render(<SitzungsBereich terminId="t" />);
    expect(screen.getByText("Begrüßung")).toBeInTheDocument();
    expect(screen.queryByText("sitzung.protokoll")).not.toBeInTheDocument();
  });
});
