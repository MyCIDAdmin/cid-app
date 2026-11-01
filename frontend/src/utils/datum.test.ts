import { describe, expect, it, vi } from "vitest";

// Sprachwechsel über den echten i18n lädt Übersetzungen per HTTP — hier genügt die Sprache selbst.
const sprache = vi.hoisted(() => ({ language: "de" }));
vi.mock("../i18n", () => ({ default: sprache }));

import { lokaleSprache, vorZeit } from "./datum";

describe("lokaleSprache", () => {
  it("liefert deutsches Format für Deutsch (nicht das Format des Telefons)", () => {
    sprache.language = "de";
    expect(lokaleSprache()).toBe("de-DE");
    expect(new Date(2026, 9, 18).toLocaleDateString(lokaleSprache())).toBe("18.10.2026");
  });

  it("liefert französisches Format für Französisch und Regionalvarianten", () => {
    sprache.language = "fr-FR";
    expect(lokaleSprache()).toBe("fr-FR");
    expect(new Date(2026, 9, 18).toLocaleDateString(lokaleSprache())).toBe("18/10/2026");
  });
});

describe("vorZeit", () => {
  const jetzt = new Date("2026-11-01T12:00:00Z").getTime();

  it("liefert kurze relative Zeiten auf Deutsch", () => {
    sprache.language = "de";
    expect(vorZeit("2026-11-01T11:48:00Z", jetzt)).toBe("vor 12 Minuten");
    expect(vorZeit("2026-11-01T09:00:00Z", jetzt)).toBe("vor 3 Stunden");
    expect(vorZeit("2026-10-31T12:00:00Z", jetzt)).toBe("gestern");
    expect(vorZeit("2026-11-01T11:59:50Z", jetzt)).toBe("vor 10 Sekunden");
  });

  it("liefert sie auf Französisch", () => {
    sprache.language = "fr";
    expect(vorZeit("2026-11-01T11:48:00Z", jetzt)).toBe("il y a 12 minutes");
  });

  it("zeigt ab einer Woche das Datum", () => {
    sprache.language = "de";
    expect(vorZeit("2026-10-10T12:00:00Z", jetzt)).toMatch(/10\.\s*Okt/);
  });

  it("rechnet Zeitpunkte in der Zukunft nie als 'in x Minuten' (kleine Uhrabweichung)", () => {
    sprache.language = "de";
    expect(vorZeit("2026-11-01T12:00:05Z", jetzt)).toBe("jetzt");
  });
});
