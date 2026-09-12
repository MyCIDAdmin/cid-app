import { beforeEach, describe, expect, it } from "vitest";

import { nombreArticlesPanier, totalPanier, usePanierStore } from "./panierStore";
import type { ArticlePanier } from "./panierStore";

function article(overrides: Partial<Omit<ArticlePanier, "quantite">> = {}) {
  return {
    varianteId: "v1",
    produitId: "p1",
    nom: "Maillot CA",
    taille: "M",
    couleur: "",
    prixUnitaire: "45.00",
    stockDisponible: 5,
    ...overrides,
  };
}

describe("panierStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    usePanierStore.setState({ articles: [] });
  });

  it("ajoute un nouvel article avec quantité 1 par défaut", () => {
    usePanierStore.getState().ajouter(article());
    expect(usePanierStore.getState().articles).toEqual([{ ...article(), quantite: 1 }]);
  });

  it("cumule la quantité si l'article (même variante) est déjà dans le panier", () => {
    usePanierStore.getState().ajouter(article());
    usePanierStore.getState().ajouter(article(), 2);
    expect(usePanierStore.getState().articles[0].quantite).toBe(3);
  });

  it("plafonne la quantité au stock disponible", () => {
    usePanierStore.getState().ajouter(article({ stockDisponible: 2 }), 5);
    expect(usePanierStore.getState().articles[0].quantite).toBe(2);
  });

  it("changerQuantite met à jour la quantité d'un article existant", () => {
    usePanierStore.getState().ajouter(article());
    usePanierStore.getState().changerQuantite("v1", 3);
    expect(usePanierStore.getState().articles[0].quantite).toBe(3);
  });

  it("changerQuantite plafonne au stock disponible", () => {
    usePanierStore.getState().ajouter(article({ stockDisponible: 4 }));
    usePanierStore.getState().changerQuantite("v1", 10);
    expect(usePanierStore.getState().articles[0].quantite).toBe(4);
  });

  it("changerQuantite à 0 ou moins retire l'article", () => {
    usePanierStore.getState().ajouter(article());
    usePanierStore.getState().changerQuantite("v1", 0);
    expect(usePanierStore.getState().articles).toEqual([]);
  });

  it("retirer supprime uniquement l'article ciblé", () => {
    usePanierStore.getState().ajouter(article({ varianteId: "v1" }));
    usePanierStore.getState().ajouter(article({ varianteId: "v2" }));
    usePanierStore.getState().retirer("v1");
    expect(usePanierStore.getState().articles.map((a) => a.varianteId)).toEqual(["v2"]);
  });

  it("vider vide le panier", () => {
    usePanierStore.getState().ajouter(article());
    usePanierStore.getState().vider();
    expect(usePanierStore.getState().articles).toEqual([]);
  });

  it("totalPanier et nombreArticlesPanier agrègent correctement plusieurs articles", () => {
    const articles = [
      { ...article({ varianteId: "v1", prixUnitaire: "45.00" }), quantite: 2 },
      { ...article({ varianteId: "v2", prixUnitaire: "22.50" }), quantite: 1 },
    ];
    expect(totalPanier(articles)).toBeCloseTo(112.5);
    expect(nombreArticlesPanier(articles)).toBe(3);
  });
});
