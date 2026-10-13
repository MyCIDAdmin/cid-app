import { describe, expect, it } from "vitest";

import { eintrag } from "../test/kalenderFixture";
import {
  gruppiereNachTag,
  monatsRaster,
  tagSchluessel,
  vonLokalInput,
  zuLokalInput,
} from "./kalender";

describe("monatsRaster", () => {
  it("beginnt am Montag und umfasst 42 Tage", () => {
    const { von, bis, tage } = monatsRaster(new Date(2026, 9, 1)); // Oktober 2026 beginnt am Donnerstag
    expect(tage).toHaveLength(42);
    expect(von.getDay()).toBe(1);
    expect(tagSchluessel(von)).toBe("2026-09-28");
    expect(tagSchluessel(bis)).toBe("2026-11-09");
  });
});

describe("gruppiereNachTag", () => {
  it("verteilt mehrtägige Einträge auf jeden Tag", () => {
    const e = eintrag({
      beginn: new Date(2026, 9, 10, 9).toISOString(),
      ende: new Date(2026, 9, 12, 17).toISOString(),
    });
    const karte = gruppiereNachTag([e]);
    expect([...karte.keys()].sort()).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
  });

  it("sortiert nach Beginn innerhalb eines Tages", () => {
    const spaet = eintrag({ id: "a", beginn: new Date(2026, 9, 10, 20).toISOString() });
    const frueh = eintrag({ id: "b", beginn: new Date(2026, 9, 10, 8).toISOString() });
    expect(
      gruppiereNachTag([spaet, frueh])
        .get("2026-10-10")
        ?.map((x) => x.id),
    ).toEqual(["b", "a"]);
  });
});

describe("Lokalformat", () => {
  it("wandelt datetime-local und Datum hin und zurück", () => {
    const iso = new Date(2026, 9, 10, 18, 30).toISOString();
    expect(zuLokalInput(iso)).toBe("2026-10-10T18:30");
    expect(zuLokalInput(iso, true)).toBe("2026-10-10");
    expect(vonLokalInput("2026-10-10T18:30")).toBe(iso);
    expect(vonLokalInput("")).toBeNull();
  });
});
