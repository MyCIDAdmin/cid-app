/** Deutsch und Französisch haben dieselben Schlüssel, und jeder fest eingetragene Schlüssel existiert. */
import { describe, expect, it } from "vitest";

import de from "../public/locales/de/wahlen.json";
import fr from "../public/locales/fr/wahlen.json";

const QUELLEN = import.meta.glob(
  ["./components/wahlen/*.tsx", "./pages/wahlen/*.tsx", "!./**/*.test.tsx"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

function schluessel(obj: Record<string, unknown>, vorsatz = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? schluessel(v as Record<string, unknown>, `${vorsatz}${k}.`)
      : [`${vorsatz}${k}`],
  );
}

describe("Übersetzungen Wahlen", () => {
  it("Deutsch und Französisch haben dieselben Schlüssel", () => {
    expect(schluessel(fr).sort()).toEqual(schluessel(de).sort());
  });

  it("jeder fest eingetragene Schlüssel ist übersetzt", () => {
    const vorhanden = new Set(schluessel(de));
    const dateien = Object.entries(QUELLEN);
    expect(dateien.length).toBeGreaterThan(5);
    const fehlend: string[] = [];
    for (const [datei, text] of dateien) {
      for (const m of text.matchAll(/\bt\(\s*"([a-z_0-9.]+)"/g)) {
        if (!vorhanden.has(m[1])) fehlend.push(`${datei}: ${m[1]}`);
      }
    }
    expect(fehlend).toEqual([]);
  });
});
