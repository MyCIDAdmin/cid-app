import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Probewahl, Wahl } from "../../types/wahlen";
import ProbewahlBlock from "./ProbewahlBlock";
import WahlbueroTab from "./WahlbueroTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return {
    ...actual,
    useProbewahl: vi.fn(),
    useBeteiligung: vi.fn(),
    useUebergabe: vi.fn(),
    useUebergabeSetzen: vi.fn(),
    useWahlzettel: vi.fn(),
  };
});

const wahl = (extra: Partial<Wahl> = {}) =>
  ({ id: "w1", vote_session: null, ist_ausschuss: true, ...extra }) as Wahl;

const PROBE: Probewahl = {
  stimmen: 40,
  szenario: "gleichstand",
  typ: "unique",
  beispiel: false,
  weiterer_wahlgang: true,
  ergebnis: {
    ausgang: "stichwahl",
    gewaehlt: [],
    stichwahl_zwischen: ["Liste A", "Liste B"],
    schwelle: 50,
    beteiligung: { abgegeben: 40, berechtigt: 120, prozent: 33.3 },
    optionen: [
      { id: "o1", label: "Liste A", stimmen: 16, prozent: 40, personen: [] },
      { id: "o2", label: "Liste B", stimmen: 16, prozent: 40, personen: [] },
    ],
  },
  bereitschaft: [
    { schluessel: "ausschuss", ok: true, anzahl: 3 },
    { schluessel: "bekanntmachungen", ok: false, anzahl: 5 },
  ],
};

function vorbereiten(data?: Probewahl) {
  const probe = { mutate: vi.fn(), isPending: false, data };
  vi.mocked(hooks.useProbewahl).mockReturnValue(
    probe as unknown as ReturnType<typeof hooks.useProbewahl>,
  );
  return probe;
}

describe("ProbewahlBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Die übrigen Abschnitte des Wahlbüros sind hier nicht Thema.
    vi.mocked(hooks.useBeteiligung).mockReturnValue({} as ReturnType<typeof hooks.useBeteiligung>);
    vi.mocked(hooks.useUebergabe).mockReturnValue({} as ReturnType<typeof hooks.useUebergabe>);
    vi.mocked(hooks.useUebergabeSetzen).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useUebergabeSetzen>);
    vi.mocked(hooks.useWahlzettel).mockReturnValue({} as ReturnType<typeof hooks.useWahlzettel>);
  });

  it("startet den Trockenlauf mit gewählter Zahl und Szenario", () => {
    const probe = vorbereiten();
    renderWithProviders(<ProbewahlBlock wahl={wahl()} />);
    fireEvent.change(screen.getByLabelText("probe.stimmen"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("probe.szenario"), { target: { value: "gleichstand" } });
    fireEvent.click(screen.getByText("probe.starten"));
    expect(probe.mutate).toHaveBeenCalledWith(
      { stimmen: 60, szenario: "gleichstand" },
      expect.anything(),
    );
  });

  it("zeigt Ergebnis, Hinweis auf erfundene Stimmen und die Startbereitschaft", () => {
    vorbereiten(PROBE);
    renderWithProviders(<ProbewahlBlock wahl={wahl()} />);
    expect(screen.getByText("probe.erfunden")).toBeInTheDocument();
    expect(screen.getByTestId("ausgang")).toBeInTheDocument();
    expect(screen.getByTestId("probe-weiter")).toBeInTheDocument();
    expect(screen.getByTestId("bereit-ausschuss")).toHaveTextContent("✓");
    expect(screen.getByTestId("bereit-bekanntmachungen")).toHaveTextContent("✗");
  });

  it("weist auf Beispielnamen hin, wenn es noch keine Kandidaturen gibt", () => {
    vorbereiten({ ...PROBE, beispiel: true, weiterer_wahlgang: false });
    renderWithProviders(<ProbewahlBlock wahl={wahl()} />);
    expect(screen.getByText("probe.beispiel")).toBeInTheDocument();
    expect(screen.queryByTestId("probe-weiter")).not.toBeInTheDocument();
  });

  it("erscheint im Wahlbüro nur, solange die Wahl nicht geöffnet ist", () => {
    vorbereiten();
    const { unmount } = renderWithProviders(<WahlbueroTab wahl={wahl()} />);
    expect(screen.getByTestId("probewahl")).toBeInTheDocument();
    unmount();
    renderWithProviders(<WahlbueroTab wahl={wahl({ vote_session: "v1" })} />);
    expect(screen.queryByTestId("probewahl")).not.toBeInTheDocument();
  });
});
