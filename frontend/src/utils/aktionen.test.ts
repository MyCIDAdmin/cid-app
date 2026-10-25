import { describe, expect, it } from "vitest";

import { formatFrist, heuteIso, istDringlich, istWaehlbareAktion, tageBisFrist } from "./aktionen";

const JETZT = new Date(2026, 9, 25, 15, 30); // 25.10.2026, nachmittags

describe("Beitragsaktionen-Hilfen", () => {
  it("heuteIso liefert das Datum in Ortszeit", () => {
    expect(heuteIso(JETZT)).toBe("2026-10-25");
  });

  it("tageBisFrist zählt ganze Tage und ist 0 am letzten Tag", () => {
    expect(tageBisFrist("2026-10-25", JETZT)).toBe(0);
    expect(tageBisFrist("2026-10-28", JETZT)).toBe(3);
    expect(tageBisFrist("2026-10-24", JETZT)).toBe(-1);
    expect(tageBisFrist(null, JETZT)).toBeNull();
  });

  it("formatFrist folgt der Sprache", () => {
    expect(formatFrist("2026-12-24", "de")).toBe("24.12.2026");
    expect(formatFrist("2026-12-24", "fr")).toBe("24/12/2026");
  });

  it("istDringlich: markiert oder Frist innerhalb von 3 Tagen, nie nach Ablauf", () => {
    const heute = heuteIso();
    const inTagen = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return heuteIso(d);
    };
    expect(istDringlich({ dringend: true, frist: null, abgelaufen: false })).toBe(true);
    expect(istDringlich({ dringend: true, frist: null, abgelaufen: true })).toBe(false);
    expect(istDringlich({ dringend: false, frist: heute, abgelaufen: false })).toBe(true);
    expect(istDringlich({ dringend: false, frist: inTagen(3), abgelaufen: false })).toBe(true);
    expect(istDringlich({ dringend: false, frist: inTagen(10), abgelaufen: false })).toBe(false);
    expect(istDringlich({ dringend: false, frist: null, abgelaufen: false })).toBe(false);
  });

  it("istWaehlbareAktion: aktiv, eigener Artikel, nicht abgelaufen", () => {
    expect(istWaehlbareAktion({ actif: true, type_fixe: null, abgelaufen: false })).toBe(true);
    expect(istWaehlbareAktion({ actif: false, type_fixe: null, abgelaufen: false })).toBe(false);
    expect(istWaehlbareAktion({ actif: true, type_fixe: "cotisation", abgelaufen: false })).toBe(
      false,
    );
    expect(istWaehlbareAktion({ actif: true, type_fixe: null, abgelaufen: true })).toBe(false);
  });
});
