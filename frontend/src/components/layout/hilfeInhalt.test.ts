/**
 * Inhaltsprüfung der Aufgabenkarten (Konzept_Aufgabenkarten.md) : Deutsch und Französisch haben
 * dieselben Karten, die neuen Felder sind stimmig, Bilder existieren, und jede Übung hält die
 * Schutzregeln für die Testfälle ein (nur „[ÜBUNG]“-Einträge, kein Zurücksetzen der Demo-Daten).
 */
import { describe, expect, it } from "vitest";

import helpDe from "../../../public/locales/de/help.json";
import helpFr from "../../../public/locales/fr/help.json";
import { KARTEN_ROLLEN, type Workflow } from "./hilfeKarten";

// Vorhandene Bildnamen (nur die Schlüssel, die Dateien selbst werden nicht geladen).
const BILDER = Object.keys(import.meta.glob("../../../public/hilfe/bilder/*")).map((p) =>
  p.split("/").pop(),
);

function laden(lang: "de" | "fr"): Record<string, { workflows?: Workflow[] }> {
  return (lang === "de" ? helpDe : helpFr) as unknown as Record<string, { workflows?: Workflow[] }>;
}

function karten(lang: "de" | "fr"): { bereich: string; i: number; karte: Workflow }[] {
  return Object.entries(laden(lang)).flatMap(([bereich, wert]) =>
    wert && typeof wert === "object" && Array.isArray(wert.workflows)
      ? wert.workflows.map((karte, i) => ({ bereich, i, karte }))
      : [],
  );
}

describe("Aufgabenkarten: Inhalt", () => {
  const de = karten("de");
  const fr = karten("fr");

  it("Deutsch und Französisch haben dieselben Karten mit gleicher Struktur", () => {
    expect(fr.map((k) => `${k.bereich}/${k.i}`)).toEqual(de.map((k) => `${k.bereich}/${k.i}`));
    de.forEach((k, n) => {
      const f = fr[n].karte;
      expect(f.id, `${k.bereich}/${k.i}`).toBe(k.karte.id);
      expect(f.rollen, `${k.bereich}/${k.i}`).toEqual(k.karte.rollen);
      expect(f.schritte.length, `${k.bereich}/${k.i}`).toBe(k.karte.schritte.length);
      expect(f.erwartet?.length, `${k.bereich}/${k.i}`).toBe(k.karte.erwartet?.length);
      expect(f.fehler?.length, `${k.bereich}/${k.i}`).toBe(k.karte.fehler?.length);
      expect(Boolean(f.uebung), `${k.bereich}/${k.i}`).toBe(Boolean(k.karte.uebung));
      expect(f.bilder, `${k.bereich}/${k.i}`).toEqual(k.karte.bilder);
    });
  });

  it("Kennungen sind eindeutig, Rollen bekannt, Schritte höchstens sieben", () => {
    const ids = de.map((k) => k.karte.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    de.forEach(({ bereich, i, karte }) => {
      (karte.rollen ?? []).forEach((r) =>
        expect(KARTEN_ROLLEN as readonly string[], `${bereich}/${i}`).toContain(r),
      );
      if (karte.id) expect(karte.schritte.length, karte.id).toBeLessThanOrEqual(7);
      if (karte.erwartet)
        expect(karte.erwartet.length, `${bereich}/${i}`).toBe(karte.schritte.length);
    });
  });

  it("Bilder verweisen auf vorhandene Dateien und gültige Schritte", () => {
    de.forEach(({ bereich, i, karte }) =>
      (karte.bilder ?? []).forEach((b) => {
        expect(BILDER, `${bereich}/${i}: ${b.datei}`).toContain(b.datei);
        expect(b.schritt).toBeGreaterThanOrEqual(1);
        expect(b.schritt).toBeLessThanOrEqual(karte.schritte.length);
        expect(b.alt.length).toBeGreaterThan(3);
      }),
    );
  });

  it.each([
    ["de", de],
    ["fr", fr],
  ] as const)("Übungen schützen die Testfälle (%s)", (_lang, liste) => {
    liste.forEach(({ bereich, i, karte }) => {
      if (!karte.uebung) return;
      const kennung = `${bereich}/${i}`;
      expect(karte.uebung, kennung).toMatch(/ÜBUNG/);
      expect(karte.uebung.toLowerCase(), kennung).not.toContain("reset");
      expect(karte.uebung.toLowerCase(), kennung).not.toContain("demo_daten");
      // Keine Anweisung, [DEMO]-Daten zu ändern : [DEMO] darf nur als Verbot vorkommen.
      if (karte.uebung.includes("[DEMO]"))
        expect(karte.uebung, kennung).toMatch(
          /Berühre keine \[DEMO\]|Ne touchez à aucun paiement \[DEMO\]/,
        );
    });
  });
});
