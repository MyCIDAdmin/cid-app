import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type {
  ClassementLigue,
  RencontreCalendrier,
  SpielerDesSpiels,
  TippspielMatrix,
} from "../../types/communaute";
import SpieltagTab from "./SpieltagTab";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useCalendrierRencontres: vi.fn(),
    useClassementLigue: vi.fn(),
    useMeinTippstand: vi.fn(),
    useTippspielMatrix: vi.fn(),
    useSpielerDesSpiels: vi.fn(),
    useStimmeFuerSpieler: vi.fn(),
    useEquipesLogos: vi.fn(),
  };
});

const TAG = 86_400_000;

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function spiel(overrides: Partial<RencontreCalendrier> = {}): RencontreCalendrier {
  return {
    id: "n1",
    competition: "Ligue 1",
    art: "liga",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: new Date(Date.now() + 10 * TAG).toISOString(),
    score_domicile: null,
    score_exterieur: null,
    statut: "SCHEDULED",
    est_a_venir: true,
    modifie_manuellement: false,
    ajout_manuel: false,
    maj_le: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function zeile(equipe: string, rang: number, points: number, forme: string): ClassementLigue {
  return {
    id: equipe,
    equipe,
    rang,
    points,
    forme_recente: forme,
    saison: "2026-2027",
  } as ClassementLigue;
}

function kalender(...rencontres: RencontreCalendrier[]) {
  vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
    data: page(rencontres),
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
}

function tippstand(bestaetigt: boolean, tipps: [string, number, number, number | null][] = []) {
  vi.mocked(useCommunauteHooks.useMeinTippstand).mockReturnValue({
    tippspiel: { id: "tp1" } as never,
    teilnahme: undefined,
    bestaetigt,
    tippsProSpiel: new Map(
      tipps.map(([id, d, e, p]) => [
        id,
        { id: `t-${id}`, rencontre: id, score_domicile: d, score_exterieur: e, points: p } as never,
      ]),
    ),
  });
}

function matrix(daten: TippspielMatrix | undefined) {
  vi.mocked(useCommunauteHooks.useTippspielMatrix).mockReturnValue({
    data: daten,
  } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielMatrix>);
}

function spieler(daten: SpielerDesSpiels, mutate = vi.fn()) {
  vi.mocked(useCommunauteHooks.useSpielerDesSpiels).mockReturnValue({
    data: daten,
    isLoading: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useSpielerDesSpiels>);
  vi.mocked(useCommunauteHooks.useStimmeFuerSpieler).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useStimmeFuerSpieler>);
  return mutate;
}

describe("SpieltagTab", () => {
  const onWechsel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: { id: "u1", email: "a@b.de", role: "membre", langue_preferee: "de" } as never,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useEquipesLogos).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useCommunauteHooks.useEquipesLogos>);
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([]),
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);
    tippstand(false);
    matrix(undefined);
    spieler({ rencontre: null });
    kalender();
  });

  it("zeigt den Hinweis, wenn kein weiteres Spiel angesetzt ist", () => {
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    expect(screen.getByText("spieltag.kein_naechstes")).toBeInTheDocument();
  });

  it("zeigt das nächste Spiel mit Countdown und überspringt Abgesagtes", () => {
    kalender(
      spiel({
        id: "abg",
        equipe_exterieur: "Abgesagt",
        statut: "CANCELLED",
        date_heure: new Date(Date.now() + 2 * TAG).toISOString(),
      }),
      spiel({
        id: "spaeter",
        equipe_exterieur: "Später",
        date_heure: new Date(Date.now() + 20 * TAG).toISOString(),
      }),
      spiel({
        id: "n1",
        equipe_exterieur: "Der Nächste",
        date_heure: new Date(Date.now() + 5 * TAG + 3_600_000).toISOString(),
      }),
    );
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    const hero = within(screen.getByTestId("spieltag-hero"));
    expect(hero.getByText(/Der Nächste/)).toBeInTheDocument();
    expect(hero.queryByText(/Abgesagt/)).not.toBeInTheDocument();
    expect(hero.getByRole("timer")).toHaveTextContent("5");
  });

  it("kennzeichnet kontinentale Spiele", () => {
    kalender(
      spiel({
        competition: "CAF Champions League",
        art: "kontinental",
        equipe_exterieur: "Al Ahly",
      }),
    );
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    expect(
      within(screen.getByTestId("spieltag-hero")).getByText("live.spielplan_filter_kontinental"),
    ).toBeInTheDocument();
  });

  it("bietet bei Auswärtsspielen die Reise an und wechselt in den Spielplan", () => {
    kalender(spiel({ id: "aw", equipe_domicile: "USM Alger", equipe_exterieur: "Club Africain" }));
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    expect(
      screen.getByRole("link", { name: "live.calendrier_reise_organisieren" }),
    ).toHaveAttribute("href", "/reisen/neu?rencontre=aw");
    fireEvent.click(screen.getByRole("button", { name: "spieltag.zum_spielplan" }));
    expect(onWechsel).toHaveBeenCalledWith("spielplan");
  });

  it("meldet offene Tipps und führt zum Tippspiel", () => {
    kalender(spiel({ id: "a" }), spiel({ id: "b", equipe_exterieur: "Zweiter" }));
    tippstand(true, [["a", 1, 0, null]]);
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    const hinweis = within(screen.getByTestId("offene-tipps"));
    expect(hinweis.getByText(/spieltag.offene_tipps/)).toBeInTheDocument();
    fireEvent.click(hinweis.getByRole("button", { name: "spieltag.jetzt_tippen" }));
    expect(onWechsel).toHaveBeenCalledWith("tippspiel");
  });

  it("zeigt keine offenen Tipps, wenn alles getippt ist oder man nicht teilnimmt", () => {
    kalender(spiel({ id: "a" }));
    tippstand(true, [["a", 1, 0, null]]);
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    expect(screen.queryByTestId("offene-tipps")).not.toBeInTheDocument();
  });

  it("zeigt Nicht-Teilnehmern keine Tipp-Stimmung", () => {
    kalender(spiel({ date_heure: new Date(Date.now() + 3_600_000).toISOString() }));
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    expect(screen.queryByTestId("spieltag-stimmung")).not.toBeInTheDocument();
  });

  it("zeigt nach der Sperre die Stimmung der Community", () => {
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    kalender(spiel({ id: "n1", date_heure: soon }));
    tippstand(true, [["n1", 2, 1, null]]);
    matrix({
      tippspiel: "tp1",
      tipps_sichtbar: true,
      teilnehmer: 3,
      letztes_spiel: null,
      spalten: [
        {
          id: "n1",
          competition: "Ligue 1",
          equipe_domicile: "Club Africain",
          equipe_exterieur: "ES Tunis",
          date_heure: soon,
          score_domicile: null,
          score_exterieur: null,
          statut: "SCHEDULED",
        },
      ],
      zeilen: [
        {
          rang: 1,
          rang_vorher: null,
          name: "A",
          ist_ich: true,
          punkte: 0,
          exakt: 0,
          letzte_punkte: null,
          tipps: { n1: { d: 2, e: 1, p: null } },
        },
        {
          rang: 2,
          rang_vorher: null,
          name: "B",
          ist_ich: false,
          punkte: 0,
          exakt: 0,
          letzte_punkte: null,
          tipps: { n1: { d: 2, e: 1, p: null } },
        },
        {
          rang: 3,
          rang_vorher: null,
          name: "C",
          ist_ich: false,
          punkte: 0,
          exakt: 0,
          letzte_punkte: null,
          tipps: { n1: { d: 0, e: 0, p: null } },
        },
      ],
    });
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    const stimmung = within(screen.getByTestId("spieltag-stimmung"));
    expect(stimmung.getByText(/2:1 · 2×/)).toBeInTheDocument();
    expect(stimmung.getByText(/0:0 · 1×/)).toBeInTheDocument();
    expect(stimmung.getByText("spieltag.verteilung")).toBeInTheDocument();
  });

  it("vergleicht die Form mit dem Gegner aus der Tabelle", () => {
    kalender(spiel());
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([zeile("Club Africain", 2, 20, "VVNDV"), zeile("ES Tunis", 1, 24, "VVVVV")]),
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    const karte = within(screen.getByTestId("spieltag-form"));
    expect(karte.getByText("ES Tunis")).toBeInTheDocument();
    expect(karte.getByText("24")).toBeInTheDocument();
  });

  it("zeigt das letzte Ergebnis mit meinem Tipp", () => {
    kalender(
      spiel({
        id: "alt",
        est_a_venir: false,
        statut: "FINISHED",
        score_domicile: 3,
        score_exterieur: 1,
        date_heure: "2026-09-20T18:00:00Z",
      }),
    );
    tippstand(true, [["alt", 2, 0, 2]]);
    renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
    const karte = within(screen.getByTestId("spieltag-letztes"));
    expect(karte.getByText(/3 : 1/)).toBeInTheDocument();
    expect(karte.getByText("live.calendrier_resultat_sieg")).toBeInTheDocument();
    expect(karte.getByText("spieltag.dein_tipp_punkte")).toBeInTheDocument();
  });

  describe("Spieler des Spiels", () => {
    const spielInfo = {
      equipe_domicile: "Club Africain",
      equipe_exterieur: "ES Tunis",
      date_heure: "2026-10-01T18:00:00Z",
      competition: "Ligue 1",
      score_domicile: 2,
      score_exterieur: 1,
    };

    it("lässt Mitglieder einen Spieler wählen und abstimmen", () => {
      const mutate = spieler({
        rencontre: "r9",
        spiel: spielInfo,
        offen: true,
        bis: new Date(Date.now() + 10 * 3_600_000).toISOString(),
        kandidaten: [
          { id: "p1", name: "Sadok Kadida", numero: 9, poste: "Forwards" },
          { id: "p2", name: "Taddeus Nkeng", numero: 8, poste: "Midfielders" },
        ],
        meine_stimme: null,
        ergebnis: null,
      });
      renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
      const karte = within(screen.getByTestId("spieler-des-spiels"));
      const knopf = karte.getByRole("button", { name: "spieltag.spieler_abstimmen" });
      expect(knopf).toBeDisabled();
      fireEvent.change(karte.getByLabelText("spieltag.spieler_waehlen"), {
        target: { value: "p2" },
      });
      fireEvent.click(knopf);
      expect(mutate).toHaveBeenCalledWith({ rencontre: "r9", spieler: "p2" }, expect.anything());
      // Ergebnis bleibt bis zur eigenen Stimme verborgen
      expect(karte.queryByTestId("spieler-ergebnis")).not.toBeInTheDocument();
    });

    it("zeigt nach der eigenen Stimme das Zwischenergebnis", () => {
      spieler({
        rencontre: "r9",
        spiel: spielInfo,
        offen: true,
        bis: new Date(Date.now() + 10 * 3_600_000).toISOString(),
        kandidaten: [],
        meine_stimme: "p2",
        ergebnis: [
          { name: "Taddeus Nkeng", stimmen: 5 },
          { name: "Sadok Kadida", stimmen: 2 },
        ],
        stimmen_gesamt: 7,
      });
      renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
      const karte = within(screen.getByTestId("spieler-des-spiels"));
      expect(karte.getByText("spieltag.spieler_danke")).toBeInTheDocument();
      expect(
        karte.queryByRole("button", { name: "spieltag.spieler_abstimmen" }),
      ).not.toBeInTheDocument();
      expect(within(karte.getByTestId("spieler-ergebnis")).getAllByRole("listitem")).toHaveLength(
        2,
      );
    });

    it("zeigt nach Ende der Abstimmung nur das Ergebnis", () => {
      spieler({
        rencontre: "r9",
        spiel: spielInfo,
        offen: false,
        bis: "2026-10-02T20:00:00Z",
        kandidaten: [],
        meine_stimme: null,
        ergebnis: [{ name: "Taddeus Nkeng", stimmen: 5 }],
        stimmen_gesamt: 5,
      });
      renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
      const karte = within(screen.getByTestId("spieler-des-spiels"));
      expect(karte.getByText("spieltag.spieler_beendet")).toBeInTheDocument();
      expect(karte.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("blendet die Karte aus, wenn es kein Spiel zur Abstimmung gibt", () => {
      spieler({ rencontre: null });
      renderWithProviders(<SpieltagTab onWechsel={onWechsel} />);
      expect(screen.queryByTestId("spieler-des-spiels")).not.toBeInTheDocument();
    });
  });
});
