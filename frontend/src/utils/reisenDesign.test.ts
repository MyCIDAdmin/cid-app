import { describe, expect, it } from "vitest";

import { listItem } from "../test/reisenDaten";
import { coverFuer, fortschritt, naechsteReise } from "./reisenDesign";

describe("coverFuer", () => {
  it("liefert für denselben Ort immer denselben Verlauf", () => {
    expect(coverFuer("Kairo")).toBe(coverFuer(" kairo "));
  });
});

describe("fortschritt", () => {
  it("rechnet gegen die Mindestzahl und deckelt bei 100", () => {
    expect(fortschritt(2, 12)).toBe(17);
    expect(fortschritt(14, 12)).toBe(100);
  });
  it("ist ohne Mindestzahl leer", () => {
    expect(fortschritt(5, null)).toBeNull();
  });
});

describe("naechsteReise", () => {
  const jetzt = Date.parse("2026-11-01T12:00:00Z");
  it("nimmt die früheste kommende Reise, bei der ich dabei bin", () => {
    const r = naechsteReise(
      [
        listItem({ id: "a", start: "2026-12-10", ende: "2026-12-12", mein_status: "interessiert" }),
        listItem({ id: "b", start: "2027-01-20", ende: "2027-01-22", mein_status: "dabei" }),
        listItem({ id: "c", start: "2026-11-26", ende: "2026-11-30", mein_status: "dabei" }),
      ],
      jetzt,
    );
    expect(r?.id).toBe("c");
  });
  it("fällt auf „interessiert“ zurück und ignoriert vergangene, abgesagte und fremde Reisen", () => {
    const r = naechsteReise(
      [
        listItem({ id: "alt", start: "2026-09-01", ende: "2026-09-03", mein_status: "dabei" }),
        listItem({ id: "ab", start: "2026-12-01", mein_status: "dabei", abgesagt: true }),
        listItem({ id: "fremd", start: "2026-12-02", mein_status: null }),
        listItem({ id: "i", start: "2026-12-10", ende: "2026-12-12", mein_status: "interessiert" }),
      ],
      jetzt,
    );
    expect(r?.id).toBe("i");
  });
  it("liefert ohne Treffer nichts", () => {
    expect(naechsteReise([], jetzt)).toBeUndefined();
  });
});
