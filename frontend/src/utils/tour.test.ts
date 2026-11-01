import { describe, expect, it } from "vitest";

import {
  appStationen,
  datumIso,
  hinweisFuerPfad,
  hinweisSichtbar,
  morgenIso,
  nachAbschluss,
  nachNieMehr,
  nachUeberspringen,
  statusVon,
  verwaltungStationen,
  willkommenArten,
} from "./tour";

const MITGLIED_SICHTBAR = new Set([
  "/",
  "/dashboard",
  "/mon-adhesion",
  "/evenements",
  "/reisen",
  "/fil",
  "/chats",
]);

describe("appStationen", () => {
  it("Mitglied : sechs Stationen, Hilfe zuletzt", () => {
    const ids = appStationen(false, MITGLIED_SICHTBAR).map((s) => s.id);
    expect(ids).toEqual([
      "start",
      "dashboard",
      "mitgliedschaft",
      "veranstaltungen",
      "community",
      "hilfe",
    ]);
  });

  it("lässt Stationen weg, deren Menüpunkt das Konto nicht sieht", () => {
    const sichtbar = new Set(["/", "/dashboard", "/chats"]);
    const stationen = appStationen(false, sichtbar);
    expect(stationen.map((s) => s.id)).toEqual(["start", "dashboard", "community", "hilfe"]);
    expect(stationen.find((s) => s.id === "community")?.ziel).toBe("/chats");
  });

  it("Fan : eigene Stationen", () => {
    const sichtbar = new Set(["/", "/regionen", "/albums", "/mon-adhesion"]);
    expect(appStationen(true, sichtbar).map((s) => s.id)).toEqual([
      "fan_start",
      "fan_regionen",
      "fan_alben",
      "fan_mitglied",
      "hilfe",
    ]);
  });

  it("Fan ohne Fotoalben-Sichtbarkeit : Station entfällt", () => {
    const sichtbar = new Set(["/", "/regionen"]);
    expect(appStationen(true, sichtbar).map((s) => s.id)).toEqual([
      "fan_start",
      "fan_regionen",
      "hilfe",
    ]);
  });
});

describe("verwaltungStationen", () => {
  it("ohne Verwaltungs-Einträge gibt es keinen Rundgang", () => {
    expect(verwaltungStationen([])).toEqual([]);
    expect(verwaltungStationen([{ key: "system", tos: [] }])).toEqual([]);
  });

  it("RH : Bereich, Mitglieder und Hilfe", () => {
    const stationen = verwaltungStationen([
      { key: "mitglieder", tos: ["/inscriptions", "/admin/justificatifs"] },
    ]);
    expect(stationen.map((s) => s.id)).toEqual(["v_bereich", "v_mitglieder", "v_hilfe"]);
    expect(stationen[0]).toMatchObject({ ziel: "gruppe-administration", gruppe: "administration" });
    expect(stationen[1]).toMatchObject({
      ziel: "/inscriptions",
      gruppe: "administration",
      subgruppe: "mitglieder",
    });
  });

  it("nimmt den bevorzugten Eintrag, sonst den ersten sichtbaren", () => {
    const stationen = verwaltungStationen([
      { key: "finanzen", tos: ["/admin/finances", "/stats"] },
      { key: "system", tos: ["/admin/roles", "/admin/einstellungen"] },
    ]);
    expect(stationen.find((s) => s.id === "v_finanzen")?.ziel).toBe("/admin/finances");
    expect(stationen.find((s) => s.id === "v_system")?.ziel).toBe("/admin/roles");
  });
});

describe("Merker", () => {
  const heute = new Date(2026, 10, 1);

  it("Standard ist offen", () => {
    expect(statusVon(undefined, "app")).toBe("offen");
    expect(statusVon({ status: "abgeschlossen" }, "app")).toBe("abgeschlossen");
    expect(statusVon({ status: "abgeschlossen" }, "verwaltung")).toBe("offen");
  });

  it("Datum lokal und morgen über Monatsgrenzen", () => {
    expect(datumIso(heute)).toBe("2026-11-01");
    expect(morgenIso(new Date(2026, 9, 31))).toBe("2026-11-01");
    expect(morgenIso(new Date(2026, 11, 31))).toBe("2027-01-01");
  });

  it("bietet nur offene Rundgänge an", () => {
    expect(willkommenArten(undefined, ["app", "verwaltung"], heute)).toEqual(["app", "verwaltung"]);
    expect(willkommenArten({ status: "abgeschlossen" }, ["app", "verwaltung"], heute)).toEqual([
      "verwaltung",
    ]);
    expect(
      willkommenArten({ status: "nie_mehr", verwaltung_status: "nie_mehr" }, ["app"], heute),
    ).toEqual([]);
  });

  it("„Später“ blendet bis zum gemerkten Tag aus", () => {
    const tour = { spaeter_bis: "2026-11-02" };
    expect(willkommenArten(tour, ["app"], heute)).toEqual([]);
    expect(willkommenArten(tour, ["app"], new Date(2026, 10, 2))).toEqual(["app"]);
  });

  it("Überspringen setzt nur offene Rundgänge und räumt „Später“ auf", () => {
    expect(nachUeberspringen(undefined, ["app", "verwaltung"])).toEqual({
      status: "uebersprungen",
      verwaltung_status: "uebersprungen",
    });
    expect(
      nachUeberspringen({ status: "abgeschlossen", spaeter_bis: "2026-11-02" }, ["app"]),
    ).toEqual({
      spaeter_bis: undefined,
    });
    expect(nachUeberspringen({ status: "abgeschlossen" }, ["app"])).toEqual({});
  });

  it("Abschluss und „Nicht mehr anzeigen“", () => {
    expect(nachAbschluss("app")).toEqual({ status: "abgeschlossen" });
    expect(nachAbschluss("verwaltung")).toEqual({ verwaltung_status: "abgeschlossen" });
    expect(nachNieMehr()).toMatchObject({ status: "nie_mehr", verwaltung_status: "nie_mehr" });
  });
});

describe("Seitenhinweise", () => {
  it("ordnet Seiten ihrem Hinweis zu", () => {
    expect(hinweisFuerPfad("/reisen")).toBe("reisen");
    expect(hinweisFuerPfad("/reisen/42")).toBe("reisen");
    expect(hinweisFuerPfad("/regionen/wettbewerb")).toBe("regionen");
    expect(hinweisFuerPfad("/cotisations/en-attente")).toBe("zahlungen");
    expect(hinweisFuerPfad("/admin/roles")).toBe("rollen");
    expect(hinweisFuerPfad("/dashboard")).toBeNull();
    expect(hinweisFuerPfad("/chats")).toBeNull();
  });

  it("zeigt bestätigte oder abgeschaltete Hinweise nicht mehr", () => {
    expect(hinweisSichtbar(undefined, "reisen")).toBe(true);
    expect(hinweisSichtbar({ hinweise: ["reisen"] }, "reisen")).toBe(false);
    expect(hinweisSichtbar({ hinweise: ["reisen"] }, "albums")).toBe(true);
    expect(hinweisSichtbar({ hinweise_aus: true }, "albums")).toBe(false);
  });
});
