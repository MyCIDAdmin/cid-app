import { describe, expect, it } from "vitest";

import type { RencontreCalendrier } from "../types/communaute";
import {
  baueAufgaben,
  gegnerName,
  istHeimspiel,
  naechstesSpiel,
  restZeit,
  tageszeit,
  tippFristOffen,
} from "./uebersicht";

function spiel(o: Partial<RencontreCalendrier> = {}): RencontreCalendrier {
  return {
    id: "m1",
    competition: "Ligue 1",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: "2026-11-29T17:00:00Z",
    score_domicile: null,
    score_exterieur: null,
    statut: "SCHEDULED",
    est_a_venir: true,
    modifie_manuellement: false,
    ajout_manuel: false,
    maj_le: "2026-10-01T00:00:00Z",
    ...o,
  };
}

const JETZT = Date.parse("2026-10-30T12:00:00Z");

describe("naechstesSpiel", () => {
  it("nimmt das früheste kommende, nicht abgesagte Spiel (Heim oder Auswärts)", () => {
    const liste = [
      spiel({ id: "alt", date_heure: "2026-10-01T17:00:00Z" }),
      spiel({ id: "abgesagt", date_heure: "2026-11-01T17:00:00Z", statut: "CANCELLED" }),
      spiel({ id: "spaet", date_heure: "2026-12-20T17:00:00Z" }),
      spiel({
        id: "naechst",
        date_heure: "2026-11-15T17:00:00Z",
        equipe_domicile: "Zamalek SC",
        equipe_exterieur: "Club Africain",
      }),
    ];
    expect(naechstesSpiel(liste, JETZT)?.id).toBe("naechst");
  });

  it("liefert nichts ohne kommendes Spiel", () => {
    expect(naechstesSpiel([], JETZT)).toBeUndefined();
    expect(naechstesSpiel(undefined, JETZT)).toBeUndefined();
  });
});

describe("Heim, Auswärts und Gegner", () => {
  it("erkennt Club Africain auf beiden Seiten", () => {
    const heim = spiel();
    const ausw = spiel({ equipe_domicile: "Zamalek SC", equipe_exterieur: "Club Africain" });
    expect(istHeimspiel(heim)).toBe(true);
    expect(gegnerName(heim)).toBe("ES Tunis");
    expect(istHeimspiel(ausw)).toBe(false);
    expect(gegnerName(ausw)).toBe("Zamalek SC");
  });
});

describe("restZeit", () => {
  it("zerlegt die Restzeit in Tage, Stunden, Minuten und Sekunden", () => {
    const ziel = JETZT + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000;
    expect(restZeit(ziel, JETZT)).toEqual({
      tage: 2,
      stunden: 3,
      minuten: 4,
      sekunden: 5,
      vorbei: false,
    });
  });

  it("meldet vorbei, sobald das Ziel erreicht ist", () => {
    expect(restZeit(JETZT, JETZT).vorbei).toBe(true);
    expect(restZeit(JETZT - 1000, JETZT).vorbei).toBe(true);
    expect(restZeit("kein Datum", JETZT).vorbei).toBe(true);
  });
});

describe("tageszeit", () => {
  it("teilt den Tag in Morgen, Tag und Abend", () => {
    expect(tageszeit(new Date(2026, 9, 30, 8))).toBe("morgen");
    expect(tageszeit(new Date(2026, 9, 30, 14))).toBe("tag");
    expect(tageszeit(new Date(2026, 9, 30, 20))).toBe("abend");
  });
});

describe("tippFristOffen", () => {
  const anpfiff = spiel({ date_heure: "2026-11-02T12:00:00Z" });

  it("ist bis einen Tag vor dem Anpfiff offen", () => {
    expect(tippFristOffen(anpfiff, Date.parse("2026-11-01T11:59:59Z"))).toBe(true);
    expect(tippFristOffen(anpfiff, JETZT)).toBe(true);
  });

  it("ist danach geschlossen", () => {
    expect(tippFristOffen(anpfiff, Date.parse("2026-11-01T12:00:01Z"))).toBe(false);
  });
});

describe("baueAufgaben", () => {
  it("ist ohne offene Dinge leer", () => {
    expect(
      baueAufgaben({
        beitrag: { status: "payee", betrag: "45.00" },
        abstimmungen: [],
        anmeldungen: [],
      }),
    ).toEqual([]);
  });

  it("ordnet nach Dringlichkeit : Abstimmung, Tipp, Reise, Beitrag, Anmeldung", () => {
    const liste = baueAufgaben({
      abstimmungen: [{ id: "v1", titel: "Hotel" }],
      tippFehlt: { spiel: "A – B", link: "/live" },
      reiseOffen: { id: "r1", titel: "Kairo" },
      beitrag: null,
      anmeldungen: [{ id: "i1", titel: "Stuttgart", betrag: "35.00" }],
    });
    expect(liste.map((a) => a.art)).toEqual([
      "abstimmung",
      "tipp",
      "reise",
      "beitrag",
      "anmeldung",
    ]);
    expect(liste[2].link).toBe("/reisen/r1");
  });

  it("unterscheidet offenen, wartenden und fehlgeschlagenen Beitrag", () => {
    const schluessel = (status: string | null) =>
      baueAufgaben({ beitrag: status === null ? null : { status, betrag: "45.00" } })[0]
        ?.schluessel;
    expect(schluessel(null)).toBe("beitrag_offen");
    expect(schluessel("en_attente")).toBe("beitrag_wartet");
    expect(schluessel("echouee")).toBe("beitrag_fehlgeschlagen");
    expect(schluessel("payee")).toBeUndefined();
  });

  it("zeigt keinen Beitrag, solange die Daten nicht geladen sind", () => {
    expect(baueAufgaben({ beitrag: undefined })).toEqual([]);
  });
});
