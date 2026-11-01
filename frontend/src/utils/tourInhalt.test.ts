/**
 * Inhaltsprüfung der Erste-Schritte-Tour : Deutsch und Französisch haben dieselben Schlüssel, und
 * jede Station und jeder Seitenhinweis aus utils/tour.ts hat in beiden Sprachen einen Text.
 */
import { describe, expect, it } from "vitest";

import de from "../../public/locales/de/tour.json";
import fr from "../../public/locales/fr/tour.json";
import { GRUPPEN_RUNDGAENGE, SEITEN, appStationen, verwaltungStationen } from "./tour";
import { NAV_ITEMS } from "../components/layout/Sidebar";
import type { SidebarSubgroupKey } from "../store/uiStore";

function schluessel(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    schluessel(v, prefix ? `${prefix}.${k}` : k),
  );
}

const ALLE_ZIELE = new Set([
  "/",
  "/dashboard",
  "/mon-adhesion",
  "/evenements",
  "/fil",
  "/regionen",
  "/albums",
]);
const UNTERGRUPPEN: SidebarSubgroupKey[] = [
  "mitglieder",
  "finanzen",
  "aktivitaeten",
  "community",
  "system",
];

describe("Tour-Texte", () => {
  it("Deutsch und Französisch haben dieselben Schlüssel", () => {
    expect(schluessel(fr).sort()).toEqual(schluessel(de).sort());
  });

  it("jede Station hat Titel und Text in beiden Sprachen", () => {
    const ids = new Set([
      ...appStationen(false, ALLE_ZIELE).map((s) => s.id),
      ...appStationen(true, ALLE_ZIELE).map((s) => s.id),
      ...verwaltungStationen(UNTERGRUPPEN.map((key) => ({ key, tos: ["/x"] }))).map((s) => s.id),
    ]);
    expect(ids.size).toBeGreaterThanOrEqual(15);
    for (const lang of [de, fr]) {
      const stationen = lang.stationen as Record<string, { titel?: string; text?: string }>;
      for (const id of ids) {
        expect(stationen[id]?.titel, id).toBeTruthy();
        expect(stationen[id]?.text, id).toBeTruthy();
      }
    }
  });

  it("jeder Seitenhinweis hat Titel und Text in beiden Sprachen", () => {
    for (const lang of [de, fr]) {
      const hinweise = lang.hinweise as Record<string, { titel?: string; text?: string }>;
      for (const [, key] of SEITEN) {
        expect(hinweise[key]?.titel, key).toBeTruthy();
        expect(hinweise[key]?.text, key).toBeTruthy();
      }
    }
  });

  it("jede Seite der Seitenleiste hat einen Tipp bzw. Rundgang-Schritt", () => {
    const pfade = new Set(SEITEN.map(([pfad]) => pfad));
    for (const item of NAV_ITEMS) expect(pfade.has(item.to), item.to).toBe(true);
  });

  it("Gruppen-Rundgänge und Zusatzzeilen haben Texte in beiden Sprachen", () => {
    for (const lang of [de, fr]) {
      for (const g of GRUPPEN_RUNDGAENGE) {
        expect((lang.hilfe.gruppen as Record<string, string>)[g], g).toBeTruthy();
      }
      for (const z of [
        "nur_lesen",
        "fan_mitglied",
        "region_keine",
        "region_meine",
        "region_verantwortlich",
        "region_freigeben",
      ]) {
        expect((lang.hinweise_zusatz as Record<string, string>)[z], z).toBeTruthy();
      }
    }
  });
});
