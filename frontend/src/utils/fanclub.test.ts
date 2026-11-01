import { describe, expect, it } from "vitest";

import type { ClassementLigue, RencontreCalendrier } from "../types/communaute";
import {
  ausgang,
  heimAuswaertsBilanz,
  ligaSpieleDerSaison,
  nachMonaten,
  passtZumFilter,
  serien,
  tabellenKpis,
  tendenzVerteilung,
  tippGruppen,
  tippsOffen,
  trend,
  zoneArt,
} from "./fanclub";

function spiel(overrides: Partial<RencontreCalendrier> = {}): RencontreCalendrier {
  return {
    id: "r1",
    competition: "Ligue 1",
    art: "liga",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: "2026-10-01T18:00:00Z",
    score_domicile: 2,
    score_exterieur: 1,
    statut: "FINISHED",
    est_a_venir: false,
    modifie_manuellement: false,
    ajout_manuel: false,
    maj_le: "2026-10-01T20:00:00Z",
    ...overrides,
  };
}

function zeile(equipe: string, rang: number, points: number, extra = {}): ClassementLigue {
  return {
    id: equipe,
    saison: "2026-2027",
    equipe,
    rang,
    points,
    zone_texte: "",
    rang_vorher: null,
    ...extra,
  } as ClassementLigue;
}

describe("zoneArt", () => {
  it("erkennt obere Zone und Abstieg", () => {
    expect(zoneArt("Promotion - CAF Champions League (Qualification)")).toBe("oben");
    expect(zoneArt("Relegation")).toBe("abstieg");
    expect(zoneArt("")).toBeNull();
    expect(zoneArt("Mittelfeld")).toBeNull();
  });
});

describe("trend", () => {
  it("zählt gewonnene Plätze positiv", () => {
    expect(trend({ rang: 3, rang_vorher: 5 })).toBe(2);
    expect(trend({ rang: 5, rang_vorher: 3 })).toBe(-2);
    expect(trend({ rang: 4, rang_vorher: 4 })).toBe(0);
    expect(trend({ rang: 4, rang_vorher: null })).toBeNull();
  });
});

describe("tabellenKpis", () => {
  const tabelle = [
    zeile("ES Tunis", 1, 30),
    zeile("Club Africain", 2, 27),
    zeile("Mitte", 3, 20),
    zeile("Letzter", 4, 8, { zone_texte: "Relegation" }),
  ];

  it("berechnet Abstände und Polster", () => {
    const kpis = tabellenKpis(tabelle);
    expect(kpis).toMatchObject({ rang: 2, punkte: 27, abstandPlatz1: 3, polsterAbstieg: 19 });
  });

  it("lässt das Polster weg, wenn keine Abstiegszone bekannt ist", () => {
    const ohne = tabelle.map((z) => ({ ...z, zone_texte: "" }));
    expect(tabellenKpis(ohne)?.polsterAbstieg).toBeNull();
  });

  it("liefert null ohne den eigenen Club", () => {
    expect(tabellenKpis([zeile("Andere", 1, 3)])).toBeNull();
  });
});

describe("Ergebnisse und Serien", () => {
  it("bestimmt den Ausgang aus Sicht des Clubs", () => {
    expect(ausgang(spiel())).toBe("sieg");
    expect(ausgang(spiel({ equipe_domicile: "ES Tunis", equipe_exterieur: "Club Africain" }))).toBe(
      "niederlage",
    );
    expect(ausgang(spiel({ score_domicile: 1, score_exterieur: 1 }))).toBe("unentschieden");
    expect(ausgang(spiel({ equipe_domicile: "A", equipe_exterieur: "B" }))).toBeNull();
  });

  it("filtert Liga-Spiele der laufenden Saison", () => {
    const spiele = [
      spiel({ id: "alt", date_heure: "2026-05-01T18:00:00Z" }),
      spiel({ id: "neu", date_heure: "2026-09-01T18:00:00Z" }),
      spiel({ id: "pokal", competition: "Coupe", date_heure: "2026-09-10T18:00:00Z" }),
    ];
    expect(ligaSpieleDerSaison(spiele, "2026-2027").map((s) => s.id)).toEqual(["neu"]);
  });

  it("rechnet Serien", () => {
    const folge = [
      spiel({ id: "1", score_domicile: 0, score_exterieur: 1 }), // N
      spiel({ id: "2", score_domicile: 2, score_exterieur: 0 }), // S, zu null
      spiel({ id: "3", score_domicile: 1, score_exterieur: 0 }), // S, zu null
      spiel({ id: "4", score_domicile: 1, score_exterieur: 1 }), // U
    ];
    const s = serien(folge);
    expect(s.aktuell).toEqual({ art: "unentschieden", laenge: 1 });
    expect(s.laengsteSiegserie).toBe(2);
    expect(s.laengsteUngeschlagen).toBe(3);
    expect(s.ungeschlagenAktuell).toBe(3);
    expect(s.spieleOhneGegentor).toBe(0);
  });

  it("trennt Heim- und Auswärtsbilanz", () => {
    const { heim, auswaerts } = heimAuswaertsBilanz([
      spiel({ id: "1" }),
      spiel({
        id: "2",
        equipe_domicile: "ES Tunis",
        equipe_exterieur: "Club Africain",
        score_domicile: 0,
        score_exterieur: 0,
      }),
    ]);
    expect(heim).toMatchObject({ spiele: 1, siege: 1, punkte: 3, toreFuer: 2, toreGegen: 1 });
    expect(auswaerts).toMatchObject({ spiele: 1, unentschieden: 1, punkte: 1 });
  });
});

describe("Spielplan-Filter und Monate", () => {
  it("filtert nach Wettbewerb und Heim/Auswärts", () => {
    const cl = spiel({ art: "kontinental", competition: "CAF Champions League" });
    const auswaerts = spiel({ equipe_domicile: "ES Tunis", equipe_exterieur: "Club Africain" });
    expect(passtZumFilter(cl, "kontinental")).toBe(true);
    expect(passtZumFilter(cl, "liga")).toBe(false);
    expect(passtZumFilter(auswaerts, "auswaerts")).toBe(true);
    expect(passtZumFilter(auswaerts, "heim")).toBe(false);
    expect(passtZumFilter(auswaerts, "alle")).toBe(true);
  });

  it("gruppiert nach Monat in Eingabereihenfolge", () => {
    const gruppen = nachMonaten([
      spiel({ id: "a", date_heure: "2026-10-05T12:00:00" }),
      spiel({ id: "b", date_heure: "2026-10-20T12:00:00" }),
      spiel({ id: "c", date_heure: "2026-11-02T12:00:00" }),
    ]);
    expect(gruppen.map((g) => [g.schluessel, g.spiele.length])).toEqual([
      ["2026-10", 2],
      ["2026-11", 1],
    ]);
  });
});

describe("Tippspiel-Hilfen", () => {
  const jetzt = Date.parse("2026-10-01T12:00:00Z");

  it("hält die Tippabgabe bis 1 Tag vor Anpfiff offen", () => {
    const offen = spiel({ est_a_venir: true, date_heure: "2026-10-03T12:00:00Z" });
    const zuSpaet = spiel({ est_a_venir: true, date_heure: "2026-10-02T11:00:00Z" });
    const pokal = spiel({
      est_a_venir: true,
      competition: "Coupe",
      date_heure: "2026-10-09T12:00:00Z",
    });
    expect(tippsOffen(offen, jetzt)).toBe(true);
    expect(tippsOffen(zuSpaet, jetzt)).toBe(false);
    expect(tippsOffen(pokal, jetzt)).toBe(false);
  });

  it("fasst gleiche Tipps zusammen, häufigste zuerst", () => {
    const gruppen = tippGruppen([
      { name: "A", d: 1, e: 0 },
      { name: "B", d: 2, e: 1 },
      { name: "C", d: 1, e: 0 },
    ]);
    expect(gruppen[0]).toEqual({ ergebnis: "1:0", anzahl: 2, namen: ["A", "C"] });
    expect(gruppen[1].ergebnis).toBe("2:1");
  });

  it("berechnet die Tendenzverteilung (Summe 100)", () => {
    const v = tendenzVerteilung([
      { d: 1, e: 0 },
      { d: 2, e: 0 },
      { d: 1, e: 1 },
      { d: 0, e: 3 },
    ]);
    expect(v).toEqual({ heim: 50, remis: 25, gast: 25 });
    expect(tendenzVerteilung([])).toEqual({ heim: 0, remis: 0, gast: 0 });
  });
});
