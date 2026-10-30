import { describe, expect, it } from "vitest";

import { teilenZiel } from "./reisenTeilen";

const basis = { id: "r1", sichtbarkeit: "mitglieder" as const, vorschau_oeffentlich: false };

describe("teilenZiel", () => {
  it("nimmt bei öffentlicher Vorschau die Vorschauseite", () => {
    const z = teilenZiel({ ...basis, vorschau_oeffentlich: true });
    expect(z?.path).toBe("/reise/r1");
    expect(z?.url).toContain("r1");
  });

  it("nimmt sonst die Adresse der Reise in der App", () => {
    expect(teilenZiel(basis, "https://mycid.org")).toEqual({
      path: "/reisen/r1",
      url: "https://mycid.org/reisen/r1",
    });
  });

  it("teilt bei Reisen nur für Eingeladene den Einladungslink, aber nur mit Token", () => {
    const e = { ...basis, sichtbarkeit: "eingeladen" as const, vorschau_oeffentlich: true };
    expect(teilenZiel(e)).toBeNull();
    expect(teilenZiel({ ...e, einladungs_token: "tok" })?.path).toBe("/reisen/einladung/tok");
  });
});
