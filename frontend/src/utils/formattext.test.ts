import { describe, expect, it } from "vitest";

import { istHtml, klartext } from "./formattext";

describe("formattext", () => {
  it("erkennt HTML und lässt Klartext mit Vergleichszeichen in Ruhe", () => {
    expect(istHtml("<p>Hallo</p>")).toBe(true);
    expect(istHtml("a < b und c > d")).toBe(false);
    expect(istHtml("Zeile 1\nZeile 2")).toBe(false);
  });

  it("liefert den sichtbaren Text", () => {
    expect(klartext("<p>Hallo <strong>Welt</strong></p><p>Zwei</p>")).toBe("Hallo Welt Zwei");
    expect(klartext("<p></p>")).toBe("");
    expect(klartext("  Klartext  ")).toBe("Klartext");
  });
});
