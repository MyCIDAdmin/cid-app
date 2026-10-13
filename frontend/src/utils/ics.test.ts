import { describe, expect, it } from "vitest";

import { eintrag } from "../test/kalenderFixture";
import { baueIcs, falteZeile, icsDateiname, icsText } from "./ics";

const JETZT = new Date(Date.UTC(2026, 9, 1, 8, 0, 0));
const zeilen = (s: string) => s.split("\r\n");

describe("baueIcs", () => {
  it("erzeugt einen gültigen Rahmen mit UTC-Zeiten", () => {
    const e = eintrag({
      beginn: "2026-10-10T16:00:00.000Z",
      ende: "2026-10-10T18:30:00.000Z",
      titel: "Sitzung, Büro; intern",
    });
    const ics = baueIcs(e, JETZT);
    const z = zeilen(ics);
    expect(z[0]).toBe("BEGIN:VCALENDAR");
    expect(z).toContain("UID:t1@my-cid.de");
    expect(z).toContain("DTSTAMP:20261001T080000Z");
    expect(z).toContain("DTSTART:20261010T160000Z");
    expect(z).toContain("DTEND:20261010T183000Z");
    expect(z).toContain("SUMMARY:Sitzung\\, Büro\\; intern");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("nimmt ohne Ende eine Stunde an", () => {
    const ics = baueIcs(eintrag({ beginn: "2026-10-10T16:00:00.000Z", ende: null }), JETZT);
    expect(ics).toContain("DTEND:20261010T170000Z");
  });

  it("schreibt ganztägige Termine als DATE mit exklusivem Ende", () => {
    const e = eintrag({
      ganztaegig: true,
      beginn: new Date(2026, 9, 10).toISOString(),
      ende: new Date(2026, 9, 11).toISOString(),
    });
    const ics = baueIcs(e, JETZT);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261010");
    expect(ics).toContain("DTEND;VALUE=DATE:20261012");
  });

  it("setzt die Wiederholungsregel mit Enddatum", () => {
    const e = eintrag({ wiederholung: "zweiwoechentlich", wiederholung_bis: "2026-12-31" });
    const ics = baueIcs(e, JETZT);
    expect(ics).toMatch(/RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T\d{6}Z/);
  });

  it("ohne Wiederholung keine RRULE; Link als URL und in der Beschreibung", () => {
    const ics = baueIcs(eintrag({ link: "https://example.de/x", beschreibung: "Hallo" }), JETZT);
    expect(ics).not.toContain("RRULE");
    expect(ics).toContain("URL:https://example.de/x");
    expect(ics).toContain("DESCRIPTION:Hallo\\n\\nhttps://example.de/x");
  });
});

describe("Hilfsfunktionen", () => {
  it("maskiert Sonderzeichen", () => {
    expect(icsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("faltet lange Zeilen auf höchstens 75 Oktette", () => {
    const lang = "SUMMARY:" + "ä".repeat(100);
    const gefaltet = falteZeile(lang).split("\r\n");
    expect(gefaltet.length).toBeGreaterThan(1);
    for (const teil of gefaltet) {
      expect(new TextEncoder().encode(teil).length).toBeLessThanOrEqual(75);
    }
    expect(gefaltet.map((t, i) => (i ? t.slice(1) : t)).join("")).toBe(lang);
  });

  it("bildet einen sauberen Dateinamen", () => {
    expect(icsDateiname("Sommerfest – Köln!")).toBe("sommerfest-koln.ics");
    expect(icsDateiname("!!!")).toBe("termin.ics");
  });
});
