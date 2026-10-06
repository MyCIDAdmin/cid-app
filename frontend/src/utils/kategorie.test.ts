import { describe, expect, it } from "vitest";

import { kategorieName } from "./kategorie";

describe("kategorieName", () => {
  const namen = { fr: "Transport", de: "Beförderung", ar: "النقل" };

  it("wählt den Namen der aktiven Sprache", () => {
    expect(kategorieName(namen, "Transport", "de")).toBe("Beförderung");
    expect(kategorieName(namen, "Transport", "ar")).toBe("النقل");
    expect(kategorieName(namen, "Transport", "de-DE")).toBe("Beförderung");
  });

  it("fällt auf den französischen Namen zurück", () => {
    expect(kategorieName(undefined, "Autres", "de")).toBe("Autres");
    expect(kategorieName({ fr: "Autres" }, "Autres", "ar")).toBe("Autres");
  });
});
