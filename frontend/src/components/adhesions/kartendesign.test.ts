import { describe, expect, it } from "vitest";

import { STILE, verlaufLinie, verlaufStopps } from "./kartendesign";
import { KARTEN_STILE } from "./kartenstile";

describe("kartendesign", () => {
  it("liest aus jedem Kartenstil mindestens zwei geordnete Farbstopps von 0 bis 1", () => {
    for (const stil of KARTEN_STILE) {
      const stopps = verlaufStopps(STILE[stil].fond);
      expect(stopps.length, stil).toBeGreaterThanOrEqual(2);
      expect(stopps[0].position, stil).toBe(0);
      expect(stopps[stopps.length - 1].position, stil).toBe(1);
      const positionen = stopps.map((s) => s.position);
      expect(positionen, stil).toEqual([...positionen].sort((a, b) => a - b));
      stopps.forEach((s) => expect(s.farbe).toMatch(/^#[0-9a-f]{6}$/i));
    }
  });

  it("verlaufStopps ignoriert alles außer Farbe und Prozent", () => {
    expect(verlaufStopps("linear-gradient(135deg,#ffffff 0%,#000000 100%)")).toEqual([
      { farbe: "#ffffff", position: 0 },
      { farbe: "#000000", position: 1 },
    ]);
    expect(verlaufStopps("none")).toEqual([]);
  });

  it("verlaufLinie läuft bei 135 Grad auf einem Quadrat von Ecke zu Ecke", () => {
    const l = verlaufLinie(100, 100, 135);
    expect(l.x0).toBeCloseTo(0);
    expect(l.y0).toBeCloseTo(0);
    expect(l.x1).toBeCloseTo(100);
    expect(l.y1).toBeCloseTo(100);
  });

  it("verlaufLinie geht immer durch die Mitte und deckt die Ecken ab", () => {
    const l = verlaufLinie(1080, 681, 135);
    expect((l.x0 + l.x1) / 2).toBeCloseTo(540);
    expect((l.y0 + l.y1) / 2).toBeCloseTo(340.5);
    // Die Ecken liegen genau auf dem Anfangs- bzw. Endlot des Verlaufs.
    const dx = l.x1 - l.x0;
    const dy = l.y1 - l.y0;
    const proj = (x: number, y: number) =>
      ((x - l.x0) * dx + (y - l.y0) * dy) / (dx * dx + dy * dy);
    expect(proj(0, 0)).toBeCloseTo(0);
    expect(proj(1080, 681)).toBeCloseTo(1);
  });
});
