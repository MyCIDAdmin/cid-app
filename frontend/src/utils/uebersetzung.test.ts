import { describe, expect, it } from "vitest";

import { uebersetzt } from "./uebersetzung";

const objekt = {
  titre: "Match",
  description: "Bonjour",
  uebersetzungen: { description: { de: "Guten Tag", ar: "مرحبا" } },
};

describe("uebersetzt", () => {
  it("liefert die Übersetzung der gewählten Sprache", () => {
    expect(uebersetzt(objekt, "description", "de")).toBe("Guten Tag");
    expect(uebersetzt(objekt, "description", "ar-TN")).toBe("مرحبا");
  });

  it("fällt auf das Original zurück", () => {
    expect(uebersetzt(objekt, "description", "fr")).toBe("Bonjour");
    expect(uebersetzt(objekt, "titre", "de")).toBe("Match");
    const ohne = { titre: "X" };
    expect(uebersetzt(ohne, "titre", "de")).toBe("X");
  });
});
