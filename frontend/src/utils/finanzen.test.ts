import { describe, expect, it } from "vitest";

import { euro, euroSigniert, prozentVon } from "./finanzen";

describe("finanzen", () => {
  it("formatiert Beträge ohne Nachkommastellen", () => {
    expect(euro("18450.00")).toBe("18.450 €");
    expect(euro(0)).toBe("0 €");
  });

  it("setzt Vorzeichen bei Ergebnissen", () => {
    expect(euroSigniert("2930.00")).toBe("+2.930 €");
    expect(euroSigniert("-120")).toBe("−120 €");
    expect(euroSigniert(0)).toBe("0 €");
  });

  it("berechnet Prozent ohne Division durch null", () => {
    expect(prozentVon("2940", "2500")).toBe(118);
    expect(prozentVon("5", 0)).toBe(0);
  });
});
