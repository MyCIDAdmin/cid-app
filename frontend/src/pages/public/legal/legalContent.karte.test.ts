/**
 * Datenschutz: Absatz zur Mitgliedskarte mit QR-Code (2026-10-31) in beiden Sprachen vorhanden,
 * mit Rechtsgrundlage und dem Hinweis, dass der QR nur eine zufällige Kennung enthält.
 */
import { describe, expect, it } from "vitest";

import { DATENSCHUTZ } from "./legalContent";

const text = (l: "de" | "fr") =>
  DATENSCHUTZ[l].sections.flatMap((sec) => sec.absaetze ?? []).join("\n");

describe("Datenschutz: Mitgliedskarte mit QR-Code", () => {
  it("steht auf Deutsch im Abschnitt 3", () => {
    expect(text("de")).toContain("3.6 Mitgliedskarte mit QR-Code");
    expect(text("de")).toContain("zufällig erzeugte Kennung, keine Personendaten");
    expect(text("de")).toContain("Art. 6 Abs. 1 lit. f DSGVO (Zutrittskontrolle");
  });

  it("steht auf Französisch im Abschnitt 3", () => {
    expect(text("fr")).toContain("3.6 Carte de membre avec code QR");
    expect(text("fr")).toContain("aucune donnée personnelle");
    expect(text("fr")).toContain("art. 6 §1 f) RGPD (contrôle d'accès");
  });
});
