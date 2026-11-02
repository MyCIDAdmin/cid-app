import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Ergebnis, Protokoll, Wahl } from "../../types/wahlen";
import ErgebnisTab from "./ErgebnisTab";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return {
    ...actual,
    useErgebnis: vi.fn(),
    useProtokoll: vi.fn(),
    useProtokollUnterschreiben: vi.fn(),
    useWahlAktion: vi.fn(),
    useEinspruchEinlegen: vi.fn(),
    useFolgewahlAnlegen: vi.fn(),
  };
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });

function wahl(extra: Partial<Wahl> = {}): Wahl {
  return {
    id: "w1",
    vote_session: "s1",
    ist_ausschuss: false,
    kann_verwalten: false,
    zustimmungen_noetig: 2,
    freigaben: {},
    einspruch_ergebnis_bis: null,
    ...extra,
  } as unknown as Wahl;
}

function ergebnis(e: Ergebnis) {
  vi.mocked(hooks.useErgebnis).mockReturnValue({ data: e } as unknown as ReturnType<
    typeof hooks.useErgebnis
  >);
}

const FREI: Ergebnis = {
  freigegeben: true,
  freigegeben_am: "2026-11-20T10:00:00Z",
  ausgang: "gewaehlt",
  gewaehlt: ["Liste Beispiel"],
  stichwahl_zwischen: [],
  schwelle: 50,
  beteiligung: { abgegeben: 30, berechtigt: 100, prozent: 30 },
  optionen: [
    { id: "o1", label: "Liste Beispiel", stimmen: 20, prozent: 66.7, personen: [] },
    { id: "o2", label: "Liste Andere", stimmen: 10, prozent: 33.3, personen: [] },
  ],
};

const PROTOKOLL: Protokoll = {
  titel: "Wahl",
  geoeffnet_am: null,
  beendet_am: "2026-11-20T09:00:00Z",
  ausschuss: [],
  ergebnis: FREI,
  erzeugt_am: "2026-11-20T10:00:00Z",
  unterschriften: [{ name: "Ada Muster", user: "u2", am: "2026-11-20T11:00:00Z" }],
  unterschriften_noetig: 3,
  unterschriften_fehlen: 2,
  einsprueche: { gesamt: 0, offen: 0 },
} as unknown as Protokoll;

describe("ErgebnisTab", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: { id: "u1", email: "a@example.de", role: "membre", langue_preferee: "de" },
      isAuthenticated: true,
    });
    vi.mocked(hooks.useProtokoll).mockReturnValue({ data: PROTOKOLL } as unknown as ReturnType<
      typeof hooks.useProtokoll
    >);
    vi.mocked(hooks.useProtokollUnterschreiben).mockReturnValue(
      mutation() as unknown as ReturnType<typeof hooks.useProtokollUnterschreiben>,
    );
    vi.mocked(hooks.useWahlAktion).mockReturnValue({
      freigabe: mutation(),
    } as unknown as ReturnType<typeof hooks.useWahlAktion>);
    vi.mocked(hooks.useFolgewahlAnlegen).mockReturnValue(
      mutation() as unknown as ReturnType<typeof hooks.useFolgewahlAnlegen>,
    );
    vi.mocked(hooks.useEinspruchEinlegen).mockReturnValue(
      mutation() as unknown as ReturnType<typeof hooks.useEinspruchEinlegen>,
    );
  });

  it("zeigt Mitgliedern vor der Freigabe keine Zahlen und keine Freigabe-Schaltfläche", () => {
    ergebnis({ freigegeben: false, beendet: true });
    renderWithProviders(<ErgebnisTab wahl={wahl()} />);
    expect(screen.getByText("ergebnis.verschlossen")).toBeInTheDocument();
    expect(screen.queryByTestId("beteiligung")).not.toBeInTheDocument();
    expect(screen.queryByTestId("freigabe-ergebnis")).not.toBeInTheDocument();
  });

  it("der Ausschuss sieht Beteiligung und kann freigeben", () => {
    ergebnis({
      freigegeben: false,
      beendet: true,
      beteiligung: { abgegeben: 5, berechtigt: 10, prozent: 50 },
    });
    renderWithProviders(<ErgebnisTab wahl={wahl({ ist_ausschuss: true })} />);
    expect(screen.getByTestId("freigabe-ergebnis")).toBeInTheDocument();
    expect(screen.getByText("ausschuss.freigeben_ergebnis")).toBeInTheDocument();
  });

  it("während die Wahl läuft gibt es noch keine Freigabe", () => {
    ergebnis({ freigegeben: false, beendet: false });
    renderWithProviders(<ErgebnisTab wahl={wahl({ ist_ausschuss: true })} />);
    expect(screen.getByText("ergebnis.laeuft")).toBeInTheDocument();
    expect(screen.queryByTestId("freigabe-ergebnis")).not.toBeInTheDocument();
  });

  it("nach der Freigabe: Ergebnis, Protokoll und Einspruch innerhalb der Frist", () => {
    ergebnis(FREI);
    const bis = new Date(Date.now() + 3 * 86400000).toISOString();
    renderWithProviders(<ErgebnisTab wahl={wahl({ einspruch_ergebnis_bis: bis })} />);
    expect(screen.getByTestId("ausgang")).toBeInTheDocument();
    expect(screen.getByText(/Liste Andere/)).toBeInTheDocument();
    expect(screen.getByTestId("protokoll")).toBeInTheDocument();
    expect(screen.getByText("einspruch.einlegen_ergebnis")).toBeInTheDocument();
  });

  it("nach Ablauf der Frist gibt es keinen Einspruch mehr", () => {
    ergebnis(FREI);
    const bis = new Date(Date.now() - 86400000).toISOString();
    renderWithProviders(<ErgebnisTab wahl={wahl({ einspruch_ergebnis_bis: bis })} />);
    expect(screen.queryByText("einspruch.einlegen_ergebnis")).not.toBeInTheDocument();
  });

  it("Ausschussmitglieder legen selbst keinen Einspruch ein, können aber unterschreiben", () => {
    ergebnis(FREI);
    const bis = new Date(Date.now() + 86400000).toISOString();
    renderWithProviders(
      <ErgebnisTab wahl={wahl({ einspruch_ergebnis_bis: bis, ist_ausschuss: true })} />,
    );
    expect(screen.queryByText("einspruch.einlegen_ergebnis")).not.toBeInTheDocument();
    expect(screen.getByText("protokoll.unterschreiben")).toBeInTheDocument();
  });
  it("bei Stichwahl: Ausschuss kann den weiteren Wahlgang anlegen, Mitglieder sehen nur einen Hinweis", () => {
    ergebnis({ ...FREI, ausgang: "stichwahl", weiterer_wahlgang: true } as Ergebnis);
    const { unmount } = renderWithProviders(<ErgebnisTab wahl={wahl({ ist_ausschuss: true })} />);
    expect(screen.getByTestId("weiterer-wahlgang")).toBeInTheDocument();
    expect(screen.getByText("folge.anlegen")).toBeInTheDocument();
    unmount();
    renderWithProviders(<ErgebnisTab wahl={wahl()} />);
    expect(screen.getByText("folge.bald")).toBeInTheDocument();
    expect(screen.queryByText("folge.anlegen")).not.toBeInTheDocument();
  });

  it("bei Stichwahl mit vorbereitetem Entwurf: Link zum nächsten Wahlgang", () => {
    ergebnis({ ...FREI, ausgang: "stichwahl", weiterer_wahlgang: true } as Ergebnis);
    renderWithProviders(
      <ErgebnisTab
        wahl={wahl({
          ist_ausschuss: true,
          folgewahl: { id: "w2", titel: "Wahl – 2. Wahlgang", status: "entwurf" },
        })}
      />,
    );
    expect(screen.getByText("folge.entwurf")).toBeInTheDocument();
    expect(screen.getByText("folge.oeffnen").closest("a")).toHaveAttribute("href", "/wahlen/w2");
  });

  it("ohne weiteren Wahlgang bleibt der Block weg", () => {
    ergebnis(FREI);
    renderWithProviders(<ErgebnisTab wahl={wahl({ ist_ausschuss: true })} />);
    expect(screen.queryByTestId("weiterer-wahlgang")).not.toBeInTheDocument();
  });
});
