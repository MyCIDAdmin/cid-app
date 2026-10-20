import { describe, expect, it } from "vitest";

import type { Produit, VarianteProduit } from "../types/boutique";
import { bestandInfo, preisInfo, stockVerfuegbar } from "./produit";

const variante = (teil: Partial<VarianteProduit>): VarianteProduit => ({
  id: "v1",
  produit: "p1",
  taille: "L",
  couleur: "",
  stock: 3,
  ...teil,
});

const produit = (varianten: VarianteProduit[]) =>
  ({
    prix: "30.00",
    prix_final: "30.00",
    prix_affiche: "30.00",
    est_prix_membre: false,
    seuil_alerte_stock: 5,
    stock_total: 20,
    stock_faible: false,
    en_rupture: false,
    variantes: varianten,
  }) as unknown as Produit;

describe("preisInfo", () => {
  it("fällt ohne Variantenpreis auf den Produktpreis zurück", () => {
    const v = variante({});
    expect(preisInfo(produit([v]), v).affiche).toBe("30.00");
    expect(preisInfo(produit([v]), null).affiche).toBe("30.00");
  });

  it("nimmt den vom Server aufgelösten Variantenpreis", () => {
    const v = variante({
      prix: "40.00",
      prix_final: "40.00",
      prix_affiche: "33.00",
      est_prix_membre: true,
    });
    expect(preisInfo(produit([v]), v)).toEqual({
      affiche: "33.00",
      final: "40.00",
      basis: "40.00",
      istMitglied: true,
    });
  });
});

describe("bestandInfo", () => {
  it("zeigt bei mehreren Varianten den Bestand der gewählten Variante", () => {
    const a = variante({ id: "a", stock: 3 });
    const b = variante({ id: "b", stock: 0 });
    const p = produit([a, b]);
    expect(bestandInfo(p, a)).toEqual({ stock: 3, faible: true, rupture: false });
    expect(bestandInfo(p, b)).toEqual({ stock: 0, faible: false, rupture: true });
  });

  it("zeigt bei nur einer Variante deren verfügbaren Bestand", () => {
    const a = variante({ stock: 3 });
    expect(bestandInfo(produit([a]), a).stock).toBe(3);
  });

  it("zieht Reservierungen anderer ab (stock_verfuegbar)", () => {
    const a = variante({ id: "a", stock: 10, stock_verfuegbar: 2 });
    const b = variante({ id: "b", stock: 4, stock_verfuegbar: 0 });
    const p = produit([a, b]);
    expect(bestandInfo(p, a)).toEqual({ stock: 2, faible: true, rupture: false });
    expect(bestandInfo(p, b)).toEqual({ stock: 0, faible: false, rupture: true });
    expect(bestandInfo(p, null)).toEqual({ stock: 2, faible: true, rupture: false });
  });

  it("ohne Varianten gilt der Produktbestand", () => {
    expect(bestandInfo(produit([]), null).stock).toBe(20);
  });
});

describe("stockVerfuegbar", () => {
  it("fällt auf den physischen Bestand zurück", () => {
    expect(stockVerfuegbar(variante({ stock: 7 }))).toBe(7);
    expect(stockVerfuegbar(variante({ stock: 7, stock_verfuegbar: 0 }))).toBe(0);
  });
});
