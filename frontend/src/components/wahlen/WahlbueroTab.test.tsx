import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type {
  BeteiligungListe,
  UebergabePunkt,
  Wahl,
  Wahlzettel as ZettelTyp,
} from "../../types/wahlen";
import WahlbueroTab, { Wahlzettel } from "./WahlbueroTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return {
    ...actual,
    useBeteiligung: vi.fn(),
    useUebergabe: vi.fn(),
    useUebergabeSetzen: vi.fn(),
    useWahlzettel: vi.fn(),
  };
});

const wahl = (extra: Partial<Wahl> = {}) =>
  ({ id: "w1", vote_session: "v1", ergebnis_freigegeben: true, ...extra }) as Wahl;

const liste: BeteiligungListe = {
  abgegeben: 1,
  berechtigt: 2,
  prozent: 50,
  eintraege: [
    { membre: "m1", name: "Anna A.", hat_gewaehlt: true },
    { membre: "m2", name: "Bernd B.", hat_gewaehlt: false },
  ],
};

const punkt = (schluessel: string, automatisch: boolean, erledigt = false): UebergabePunkt => ({
  schluessel,
  automatisch,
  erledigt,
  erledigt_am: null,
  notiz: "",
});

function vorbereiten(punkte: UebergabePunkt[] = []) {
  const setzen = { mutate: vi.fn(), isPending: false };
  vi.mocked(hooks.useBeteiligung).mockReturnValue({
    data: liste,
  } as unknown as ReturnType<typeof hooks.useBeteiligung>);
  vi.mocked(hooks.useUebergabe).mockReturnValue({
    data: punkte,
  } as unknown as ReturnType<typeof hooks.useUebergabe>);
  vi.mocked(hooks.useUebergabeSetzen).mockReturnValue(
    setzen as unknown as ReturnType<typeof hooks.useUebergabeSetzen>,
  );
  return setzen;
}

describe("WahlbueroTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt nur wer abgestimmt hat – ohne Zeitpunkt", () => {
    vorbereiten();
    renderWithProviders(<WahlbueroTab wahl={wahl({ ergebnis_freigegeben: false })} />);
    expect(screen.getByText("Anna A.")).toBeInTheDocument();
    expect(screen.getByText("buero.abgestimmt")).toBeInTheDocument();
    expect(screen.getByText("buero.offen")).toBeInTheDocument();
    expect(screen.queryByTestId("uebergabe")).not.toBeInTheDocument();
  });

  it("die Übergabe-Checkliste sperrt automatische Punkte und setzt die manuellen", () => {
    const setzen = vorbereiten([punkte_auto(), punkt("zugaenge_uebergeben", false)]);
    renderWithProviders(<WahlbueroTab wahl={wahl()} />);
    expect(screen.getByText("buero.uebergabe_stand")).toBeInTheDocument();
    const auto = screen.getByLabelText("buero.punkt.ergebnis_veroeffentlicht");
    const manuell = screen.getByLabelText("buero.punkt.zugaenge_uebergeben");
    expect(auto).toBeDisabled();
    fireEvent.click(manuell);
    expect(setzen.mutate).toHaveBeenCalledWith(
      { schluessel: "zugaenge_uebergeben", erledigt: true },
      expect.anything(),
    );
  });
});

function punkte_auto() {
  return punkt("ergebnis_veroeffentlicht", true, true);
}

describe("Wahlzettel", () => {
  it("zeigt Optionen und Personen", () => {
    const zettel: ZettelTyp = {
      typ: "multiple",
      stimmen_max: 2,
      schwelle: null,
      geoeffnet: false,
      optionen: [{ label: "Anna A.", beschreibung: "Kurz vorgestellt", personen: ["Anna A."] }],
    };
    vi.mocked(hooks.useWahlzettel).mockReturnValue({
      data: zettel,
    } as unknown as ReturnType<typeof hooks.useWahlzettel>);
    renderWithProviders(<Wahlzettel wahl={wahl()} />);
    expect(screen.getByText(/buero.wahlzettel_vorschau/)).toBeInTheDocument();
    expect(screen.getByText("Kurz vorgestellt")).toBeInTheDocument();
  });
});
