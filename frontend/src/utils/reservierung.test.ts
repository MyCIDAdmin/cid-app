import { describe, expect, it } from "vitest";

import type { Produit } from "../types/boutique";
import { reservierungFristAbgelaufen } from "./reservierung";

const JETZT = Date.parse("2026-10-20T12:00:00Z");

function produkt(modus: string, frist: string | null): Produit {
  return { reservierung_modus: modus, reservierung_frist: frist } as Produit;
}

describe("reservierungFristAbgelaufen", () => {
  it("true nur für Reservierungsartikel mit vergangener Frist", () => {
    expect(
      reservierungFristAbgelaufen(produkt("nur_reservieren", "2026-10-19T12:00:00Z"), JETZT),
    ).toBe(true);
    expect(
      reservierungFristAbgelaufen(
        produkt("reservieren_und_bezahlen", "2026-10-19T12:00:00Z"),
        JETZT,
      ),
    ).toBe(true);
  });

  it("false bei offener oder fehlender Frist und bei normalen Artikeln", () => {
    expect(
      reservierungFristAbgelaufen(produkt("nur_reservieren", "2026-10-21T12:00:00Z"), JETZT),
    ).toBe(false);
    expect(reservierungFristAbgelaufen(produkt("nur_reservieren", null), JETZT)).toBe(false);
    expect(reservierungFristAbgelaufen(produkt("aus", "2026-10-01T12:00:00Z"), JETZT)).toBe(false);
  });
});
