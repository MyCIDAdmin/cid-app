import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Quelle der Backend-Listen als Text (Vite ?raw) : hält Frontend und Backend gleich.
import backendQuelle from "../../../../backend/apps/adhesions/vorteile.py?raw";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { AvantageOffre } from "../../types/adhesion";
import VorteileKacheln from "./VorteileKacheln";
import { VORTEIL_SYMBOLE, VORTEIL_ZIELE, vorteileMitDarstellung, zielRoute } from "./vorteile";

function v(ordre: number, text: string, extra: Partial<AvantageOffre> = {}): AvantageOffre {
  return { ordre, texte_fr: text, texte_de: "", texte_ar: "", ...extra };
}

describe("vorteile (Schlüssel und Darstellung)", () => {
  it("zielRoute kennt nur feste Ziele", () => {
    expect(zielRoute("shop")).toBe("/boutique");
    expect(zielRoute("")).toBeNull();
    expect(zielRoute(undefined)).toBeNull();
    expect(zielRoute("https://example.org")).toBeNull();
    expect(zielRoute("/admin")).toBeNull();
    expect(zielRoute("toString")).toBeNull();
  });

  it("vorteileMitDarstellung sortiert und übernimmt Symbol/Ziel aus dem aktuellen Angebot", () => {
    const schnappschuss = [v(2, "Stimmrecht"), v(1, "Shop-Preis"), v(3, "Alt", { icone: "star" })];
    const aktuell = [
      v(1, "Shop-Preis", { icone: "bag", ziel: "shop" }),
      v(2, "Anderer Text", { icone: "vote" }),
      v(3, "Alt", { icone: "heart" }),
    ];
    const ergebnis = vorteileMitDarstellung(schnappschuss, aktuell);
    expect(ergebnis.map((x) => x.texte_fr)).toEqual(["Shop-Preis", "Stimmrecht", "Alt"]);
    expect(ergebnis[0]).toMatchObject({ icone: "bag", ziel: "shop" });
    expect(ergebnis[1].icone).toBeUndefined(); // anderer Text → keine Übernahme
    expect(ergebnis[2].icone).toBe("star"); // Schnappschuss hat Vorrang
    expect(vorteileMitDarstellung(schnappschuss, undefined)).toHaveLength(3);
  });

  it("zeigt bei leerem Schnappschuss die aktuellen Vorteile des Angebots (sortiert)", () => {
    const aktuell = [v(2, "Stimmrecht"), v(1, "Shop-Preis", { icone: "bag", ziel: "shop" })];
    expect(vorteileMitDarstellung([], aktuell).map((x) => x.texte_fr)).toEqual([
      "Shop-Preis",
      "Stimmrecht",
    ]);
    expect(vorteileMitDarstellung(undefined, aktuell)).toHaveLength(2);
    expect(vorteileMitDarstellung([], undefined)).toEqual([]);
  });

  it("ein nicht leerer Schnappschuss wird nie durch das aktuelle Angebot ergänzt", () => {
    const ergebnis = vorteileMitDarstellung([v(1, "Alt")], [v(1, "Alt"), v(2, "Neu")]);
    expect(ergebnis.map((x) => x.texte_fr)).toEqual(["Alt"]);
  });

  it("hat dieselben Symbol- und Ziel-Schlüssel wie das Backend", () => {
    const quelle = backendQuelle;
    const liste = (name: string) => {
      const block = new RegExp(`${name}: tuple\\[str, \\.\\.\\.\\] = \\(([^)]*)\\)`).exec(quelle);
      expect(block, `${name} im Backend gefunden`).not.toBeNull();
      return Array.from((block as RegExpExecArray)[1].matchAll(/"([a-z]+)"/g)).map((m) => m[1]);
    };
    expect([...VORTEIL_SYMBOLE]).toEqual(liste("ICONS"));
    expect(Object.keys(VORTEIL_ZIELE)).toEqual(liste("ZIELE"));
  });
});

describe("VorteileKacheln", () => {
  it("verlinkt nur Vorteile mit bekanntem Ziel", () => {
    renderWithProviders(
      <VorteileKacheln
        vorteile={[
          v(1, "Shop-Preis", { icone: "bag", ziel: "shop" }),
          v(2, "Stimmrecht"),
          v(3, "Fremd", { ziel: "gibt-es-nicht" }),
        ]}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/boutique");
    expect(links[0]).toHaveAttribute("aria-label", "vorteile.oeffnen_aria");
    expect(screen.getByText("Stimmrecht")).toBeInTheDocument();
    expect(screen.getByText("Fremd")).toBeInTheDocument();
  });

  it("zeigt mit ohneLinks keine Links (Vorschau in der Verwaltung)", () => {
    renderWithProviders(
      <VorteileKacheln vorteile={[v(1, "Shop-Preis", { ziel: "shop" })]} ohneLinks />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Shop-Preis")).toBeInTheDocument();
  });

  it("rendert nichts ohne Vorteile", () => {
    const { container } = renderWithProviders(<VorteileKacheln vorteile={[]} />);
    expect(container.querySelector("ul")).toBeNull();
  });
});
