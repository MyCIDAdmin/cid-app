/**
 * „Hilfe gesucht“ und die Tabs der Projektseite : jeder fest eingetragene Text-Schlüssel existiert
 * in Deutsch und Französisch (sonst zeigt die App den technischen Namen, z. B. „tabs.hilfe“).
 */
import { describe, expect, it } from "vitest";

import de from "../public/locales/de/projets.json";
import fr from "../public/locales/fr/projets.json";

const QUELLEN = import.meta.glob(
  ["./components/hilfe/*.tsx", "./pages/projets/ProjetsPage.tsx", "!./**/*.test.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function schluessel(obj: Record<string, unknown>, vorsatz = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? schluessel(v as Record<string, unknown>, `${vorsatz}${k}.`)
      : [`${vorsatz}${k}`],
  );
}

function fehlende(sprache: Record<string, unknown>): string[] {
  const vorhanden = new Set(schluessel(sprache));
  const gibt = (k: string) =>
    vorhanden.has(k) || vorhanden.has(`${k}_one`) || vorhanden.has(`${k}_other`);
  const fehlend: string[] = [];
  for (const [datei, text] of Object.entries(QUELLEN)) {
    for (const m of text.matchAll(/\bt\(\s*"([a-z_0-9.]+)"/g)) {
      if (!gibt(m[1])) fehlend.push(`${datei}: ${m[1]}`);
    }
    // Zusammengesetzte Schlüssel wie t(`hilfe.ansicht.${wert}`) : die Gruppe muss existieren.
    for (const m of text.matchAll(/\bt\(\s*`([a-z_0-9.]+)\.\$\{/g)) {
      if (![...vorhanden].some((k) => k.startsWith(`${m[1]}.`))) {
        fehlend.push(`${datei}: ${m[1]}.*`);
      }
    }
  }
  return fehlend;
}

describe("Übersetzungen Hilfe gesucht", () => {
  it("findet die Quelldateien", () => {
    expect(Object.keys(QUELLEN).length).toBeGreaterThan(5);
  });

  it("jeder Schlüssel ist auf Deutsch vorhanden", () => {
    expect(fehlende(de)).toEqual([]);
  });

  it("jeder Schlüssel ist auf Französisch vorhanden", () => {
    expect(fehlende(fr)).toEqual([]);
  });

  it("die Gruppen „hilfe“ und „tabs“ haben in beiden Sprachen dieselben Schlüssel", () => {
    for (const gruppe of ["hilfe", "tabs"] as const) {
      expect(schluessel(fr[gruppe]).sort()).toEqual(schluessel(de[gruppe]).sort());
    }
  });
});
