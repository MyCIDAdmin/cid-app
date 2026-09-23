import { beforeEach, describe, expect, it } from "vitest";

import {
  calculerReductionArticle,
  estArticleBonAchat,
  nombreArticlesPanier,
  sousTotalNetArticle,
  totalPanier,
  totalPanierNet,
  usePanierStore,
} from "./panierStore";
import type { ArticlePanier } from "./panierStore";
import type { RegleReduction } from "../types/boutique";

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

  it("synchroniserStocks met à jour stockDisponible et plafonne la quantité au stock live", () => {
    usePanierStore.getState().ajouter(article({ varianteId: "v1", stockDisponible: 10 }), 5);
    usePanierStore.getState().synchroniserStocks({ v1: 2 });
    const [a] = usePanierStore.getState().articles;
    expect(a.stockDisponible).toBe(2);
    expect(a.quantite).toBe(2);
  });

  it("synchroniserStocks traite une variante absente de la réponse comme épuisée (stock 0)", () => {
    usePanierStore.getState().ajouter(article({ varianteId: "v1" }), 3);
    usePanierStore.getState().synchroniserStocks({});
    const [a] = usePanierStore.getState().articles;
    expect(a.stockDisponible).toBe(0);
    expect(a.quantite).toBe(0);
  });

  it("synchroniserStocks ne retire jamais un article automatiquement", () => {
    usePanierStore.getState().ajouter(article({ varianteId: "v1" }), 1);
    usePanierStore.getState().synchroniserStocks({ v1: 0 });
    expect(usePanierStore.getState().articles).toHaveLength(1);
  });

  it("totalPanier et nombreArticlesPanier agrègent correctement plusieurs articles", () => {
    const articles = [
      { ...article({ varianteId: "v1", prixUnitaire: "45.00" }), quantite: 2 },
      { ...article({ varianteId: "v2", prixUnitaire: "22.50" }), quantite: 1 },
    ];
    expect(totalPanier(articles)).toBeCloseTo(112.5);
    expect(nombreArticlesPanier(articles)).toBe(3);
  });

  // --- Réductions par quantité indicatives (demande utilisateur du 2026-09-23) ---

  function regle(overrides: Partial<RegleReduction> = {}): RegleReduction {
    return {
      id: "r1",
      produit: "p1",
      seuil_quantite: 5,
      type_reduction: "article_offert",
      pourcentage: null,
      actif: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("calculerReductionArticle retourne aucune réduction sans règle ou sous le seuil", () => {
    const a = { ...article({ prixUnitaire: "20.00" }), quantite: 4, reglesReduction: [regle()] };
    expect(calculerReductionArticle(a)).toEqual({ quantiteOfferte: 0, pourcentageApplique: null });
  });

  it("calculerReductionArticle applique la division entière pour un article offert", () => {
    const a = { ...article({ prixUnitaire: "20.00" }), quantite: 12, reglesReduction: [regle()] };
    // 12 // 5 = 2 articles offerts
    expect(calculerReductionArticle(a).quantiteOfferte).toBe(2);
  });

  it("calculerReductionArticle applique le pourcentage atteint", () => {
    const a = {
      ...article({ prixUnitaire: "10.00" }),
      quantite: 10,
      reglesReduction: [regle({ id: "r2", seuil_quantite: 10, type_reduction: "pourcentage", pourcentage: 10 })],
    };
    expect(calculerReductionArticle(a).pourcentageApplique).toBe(10);
  });

  it("calculerReductionArticle ignore les règles inactives", () => {
    const a = {
      ...article({ prixUnitaire: "20.00" }),
      quantite: 10,
      reglesReduction: [regle({ actif: false })],
    };
    expect(calculerReductionArticle(a).quantiteOfferte).toBe(0);
  });

  it("sousTotalNetArticle déduit l'article offert du sous-total brut", () => {
    // 5 x 20€ = 100€, 1 article offert (5 // 5 = 1) => 80€.
    const a = { ...article({ prixUnitaire: "20.00" }), quantite: 5, reglesReduction: [regle()] };
    expect(sousTotalNetArticle(a)).toBeCloseTo(80);
  });

  it("sousTotalNetArticle sans règle égale le sous-total brut", () => {
    const a = { ...article({ prixUnitaire: "45.00" }), quantite: 2 };
    expect(sousTotalNetArticle(a)).toBeCloseTo(90);
  });

  it("totalPanierNet agrège le sous-total net de plusieurs articles", () => {
    const articles = [
      { ...article({ varianteId: "v1", prixUnitaire: "20.00" }), quantite: 5, reglesReduction: [regle()] },
      { ...article({ varianteId: "v2", prixUnitaire: "22.50" }), quantite: 1 },
    ];
    // 80€ (net, article offert) + 22.50€ (sans règle) = 102.50€
    expect(totalPanierNet(articles)).toBeCloseTo(102.5);
  });

  // --- Bon d'achat intégré au catalogue (demande utilisateur du 2026-09-23, "Gutschein wird
  // ein echtes Produkt im Katalog") ---

  function articleBonAchat(overrides: Partial<Omit<ArticlePanier, "quantite">> = {}) {
    return article({
      varianteId: "vb1",
      nom: "Bon d'achat CID",
      taille: "",
      couleur: "",
      prixUnitaire: "25.00",
      stockDisponible: 999999,
      typeProduit: "bon_achat",
      reglesReduction: [],
      ...overrides,
    });
  }

  it("estArticleBonAchat distingue un bon_achat d'un article physique", () => {
    expect(estArticleBonAchat({ ...article(), quantite: 1 })).toBe(false);
    expect(estArticleBonAchat({ ...articleBonAchat(), quantite: 1 })).toBe(true);
  });

  it("ajouter deux bons d'achat de la même variante sentinelle mais de montants différents crée deux lignes distinctes", () => {
    usePanierStore.getState().ajouter(articleBonAchat({ prixUnitaire: "25.00" }));
    usePanierStore.getState().ajouter(articleBonAchat({ prixUnitaire: "50.00" }));

    const articles = usePanierStore.getState().articles;
    expect(articles).toHaveLength(2);
    expect(articles.map((a) => a.prixUnitaire)).toEqual(["25.00", "50.00"]);
    // Chaque ligne reçoit un ligneId distinct (jamais fusionnées malgré la même varianteId).
    expect(articles[0].ligneId).toBeTruthy();
    expect(articles[0].ligneId).not.toBe(articles[1].ligneId);
  });

  it("ajouter un bon d'achat de montant identique à un bon existant crée quand même une ligne séparée", () => {
    usePanierStore.getState().ajouter(articleBonAchat());
    usePanierStore.getState().ajouter(articleBonAchat());
    expect(usePanierStore.getState().articles).toHaveLength(2);
  });

  it("changerQuantite/retirer opèrent sur une ligne bon d'achat via son ligneId, pas varianteId", () => {
    usePanierStore.getState().ajouter(articleBonAchat({ prixUnitaire: "25.00" }));
    usePanierStore.getState().ajouter(articleBonAchat({ prixUnitaire: "50.00" }));
    const [ligne25, ligne50] = usePanierStore.getState().articles;

    usePanierStore.getState().changerQuantite(ligne25.ligneId as string, 3);
    expect(usePanierStore.getState().articles.find((a) => a.ligneId === ligne25.ligneId)?.quantite).toBe(3);
    expect(usePanierStore.getState().articles.find((a) => a.ligneId === ligne50.ligneId)?.quantite).toBe(1);

    usePanierStore.getState().retirer(ligne25.ligneId as string);
    const restants = usePanierStore.getState().articles;
    expect(restants).toHaveLength(1);
    expect(restants[0].ligneId).toBe(ligne50.ligneId);
  });

  it("calculerReductionArticle/sousTotalNetArticle ignorent toujours les paliers pour un bon d'achat", () => {
    const a = {
      ...articleBonAchat({ prixUnitaire: "25.00" }),
      quantite: 10,
      // Même si des règles étaient présentes par erreur, un bon_achat ne doit jamais en tenir
      // compte (défensif, CLAUDE.md §8 — voir docstring calculerReductionArticle).
      reglesReduction: [regle({ seuil_quantite: 5 })],
    };
    expect(calculerReductionArticle(a)).toEqual({ quantiteOfferte: 0, pourcentageApplique: null });
    expect(sousTotalNetArticle(a)).toBeCloseTo(250);
  });
});
