import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { MitteilungsZeile, Wahl } from "../../types/wahlen";
import MitteilungenTab from "./MitteilungenTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return { ...actual, useMitteilungsplan: vi.fn(), useMitteilungKanaele: vi.fn() };
});

const wahl = (extra: Partial<Wahl> = {}) => ({ id: "w1", status: "aktiv", ...extra }) as Wahl;

const zeile = (extra: Partial<MitteilungsZeile>): MitteilungsZeile => ({
  typ: "erinnerung",
  id: "m1",
  art: "nichtwaehler",
  bezug_name: "",
  versand_am: "2026-12-01T09:00:00Z",
  zielgruppe: "nichtwaehler",
  kanaele: ["app"],
  status: "geplant",
  anzahl: null,
  kanaele_aenderbar: true,
  ...extra,
});

function vorbereiten(daten: MitteilungsZeile[]) {
  const aendern = { mutate: vi.fn(), isPending: false };
  vi.mocked(hooks.useMitteilungsplan).mockReturnValue({
    data: daten,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useMitteilungsplan>);
  vi.mocked(hooks.useMitteilungKanaele).mockReturnValue(
    aendern as unknown as ReturnType<typeof hooks.useMitteilungKanaele>,
  );
  return aendern;
}

describe("MitteilungenTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Erinnerungen, Bekanntmachungen und das Ereignis", () => {
    vorbereiten([
      zeile({}),
      zeile({
        typ: "bekanntmachung",
        id: "b1",
        art: "aufruf",
        zielgruppe: "alle",
        kanaele_aenderbar: false,
      }),
      zeile({
        typ: "ereignis",
        id: "",
        art: "pruef_entscheidung",
        versand_am: null,
        status: "ereignis",
        zielgruppe: "kandidat",
        kanaele_aenderbar: false,
      }),
    ]);
    renderWithProviders(<MitteilungenTab wahl={wahl()} />);
    expect(screen.getByTestId("mitteilung-erinnerung-nichtwaehler")).toBeInTheDocument();
    expect(screen.getByTestId("mitteilung-bekanntmachung-aufruf")).toBeInTheDocument();
    expect(screen.getByTestId("mitteilung-ereignis-pruef_entscheidung")).toBeInTheDocument();
  });

  it("schaltet den Kanal E-Mail einer Erinnerung ein", () => {
    const aendern = vorbereiten([zeile({})]);
    renderWithProviders(<MitteilungenTab wahl={wahl()} />);
    fireEvent.click(screen.getByLabelText("kanal.mail"));
    expect(aendern.mutate).toHaveBeenCalledWith(
      { id: "m1", kanaele: ["app", "mail"] },
      expect.anything(),
    );
  });

  it("sperrt die Kanäle, wenn die Erinnerung schon gesendet wurde", () => {
    vorbereiten([zeile({ status: "gesendet", kanaele_aenderbar: false, anzahl: 12 })]);
    renderWithProviders(<MitteilungenTab wahl={wahl()} />);
    expect(screen.getByLabelText("kanal.mail")).toBeDisabled();
    expect(screen.getByLabelText("kanal.app")).toBeDisabled();
  });

  it("führt von der Bekanntmachung zum Text-Tab", () => {
    vorbereiten([
      zeile({ typ: "bekanntmachung", id: "b1", art: "ergebnis", kanaele_aenderbar: false }),
    ]);
    const weiter = vi.fn();
    renderWithProviders(<MitteilungenTab wahl={wahl()} zuBekanntmachungen={weiter} />);
    fireEvent.click(screen.getByText("mitteilungen.text_bearbeiten"));
    expect(weiter).toHaveBeenCalled();
  });

  it("weist bei einem Entwurf darauf hin, dass nichts versendet wird", () => {
    vorbereiten([]);
    renderWithProviders(<MitteilungenTab wahl={wahl({ status: "entwurf" })} />);
    expect(screen.getByText("mitteilungen.entwurf")).toBeInTheDocument();
  });
});
