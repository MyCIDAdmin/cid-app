import { describe, expect, it, vi } from "vitest";

// Sprachwechsel über den echten i18n lädt Übersetzungen per HTTP — hier genügt die Sprache selbst.
const sprache = vi.hoisted(() => ({ language: "de" }));
vi.mock("../i18n", () => ({ default: sprache }));

import { lokaleSprache } from "./datum";

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
