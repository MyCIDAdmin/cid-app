/**
 * Store panier Zustand (mockup #pg-boutique-panier, FDD §3.4 "persistance session").
 *
 * Persisté en sessionStorage (effacé à la fermeture de l'onglet/navigateur) plutôt qu'en
 * localStorage comme authStore : un panier qui survivrait à un changement de compte dans le
 * même onglet (cf. le bug corrigé dans queryClient.ts pour React Query) mélangerait les
 * articles de deux membres différents. `vider()` est appelé après une commande réussie, et
 * devrait aussi l'être depuis logout() si on veut être exhaustif — non fait pour l'instant,
 * risque mineur (sessionStorage disparaît de toute façon à la fermeture de l'onglet).
 *
 * Aucun prix ici ne fait foi : uniquement pour l'affichage du panier avant commande — le
 * montant réellement facturé est toujours recalculé côté serveur à `passer` (CLAUDE.md §8).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { RegleReduction } from "../types/boutique";

export interface ArticlePanier {
  varianteId: string;
  produitId: string;
  nom: string;
  taille: string;
  couleur: string;
  prixUnitaire: string;
  stockDisponible: number;
  quantite: number;
  /**
   * Instantané des paliers de réduction actifs du produit au moment de l'ajout (demande
   * utilisateur du 2026-09-23, "Beim Kauf von über 10 Artikeln... 10% Rabatt" etc.) — optionnel
   * pour ne pas casser les paniers déjà persistés avant cet ajout (sessionStorage). Uniquement
   * indicatif : le calcul qui fait foi reste `calculer_reduction_quantite` côté serveur
   * (CLAUDE.md §8), voir aussi la revalidation de stock (`synchroniserStocks`) — ces paliers ne
   * sont eux jamais revalidés en direct (ils changent rarement, contrairement au stock).
   */
  reglesReduction?: RegleReduction[];
}

interface PanierState {
  articles: ArticlePanier[];
  ajouter: (article: Omit<ArticlePanier, "quantite">, quantite?: number) => void;
  changerQuantite: (varianteId: string, quantite: number) => void;
  retirer: (varianteId: string) => void;
  vider: () => void;
  /**
   * Revalide `stockDisponible` contre le stock serveur ACTUEL (voir
   * useVariantesParIds / PanierCommandePage) : le panier ne contient qu'un instantané figé
   * au moment de l'ajout, donc un article commandé entre-temps par quelqu'un d'autre doit
   * être détecté ici plutôt qu'à l'échec de `passer` seulement. Toute variante du panier
   * absente de `stocksParVarianteId` (produit dépublié ou variante supprimée depuis) est
   * traitée comme épuisée (stock 0) — jamais retirée automatiquement : c'est à l'utilisateur
   * de décider de retirer un article devenu indisponible ("ausverkauft").
   */
  synchroniserStocks: (stocksParVarianteId: Record<string, number>) => void;
}

export const usePanierStore = create<PanierState>()(
  persist(
    (set) => ({
      articles: [],
      ajouter: (article, quantite = 1) =>
        set((state) => {
          const existant = state.articles.find((a) => a.varianteId === article.varianteId);
          if (existant) {
            const nouvelleQuantite = Math.min(
              existant.quantite + quantite,
              existant.stockDisponible,
            );
            return {
              articles: state.articles.map((a) =>
                a.varianteId === article.varianteId ? { ...a, quantite: nouvelleQuantite } : a,
              ),
            };
          }
          return {
            articles: [
              ...state.articles,
              { ...article, quantite: Math.min(quantite, article.stockDisponible) },
            ],
          };
        }),
      changerQuantite: (varianteId, quantite) =>
        set((state) => {
          if (quantite <= 0) {
            return { articles: state.articles.filter((a) => a.varianteId !== varianteId) };
          }
          return {
            articles: state.articles.map((a) =>
              a.varianteId === varianteId
                ? { ...a, quantite: Math.min(quantite, a.stockDisponible) }
                : a,
            ),
          };
        }),
      retirer: (varianteId) =>
        set((state) => ({ articles: state.articles.filter((a) => a.varianteId !== varianteId) })),
      vider: () => set({ articles: [] }),
      synchroniserStocks: (stocksParVarianteId) =>
        set((state) => ({
          articles: state.articles.map((a) => {
            const stockActuel = stocksParVarianteId[a.varianteId] ?? 0;
            return {
              ...a,
              stockDisponible: stockActuel,
              quantite: Math.min(a.quantite, stockActuel),
            };
          }),
        })),
    }),
    { name: "cid-panier", storage: createJSONStorage(() => sessionStorage) },
  ),
);

export function totalPanier(articles: ArticlePanier[]): number {
  return articles.reduce((total, a) => total + Number(a.prixUnitaire) * a.quantite, 0);
}

export function nombreArticlesPanier(articles: ArticlePanier[]): number {
  return articles.reduce((total, a) => total + a.quantite, 0);
}

/**
 * Réduction par quantité indicative pour un article du panier — même logique que
 * `calculer_reduction_quantite` côté backend (apps/boutique/models.py) : les deux types de
 * palier sont indépendants et peuvent s'appliquer simultanément, mais seule la règle au seuil
 * le plus élevé ATTEINT de chaque type compte (jamais de cumul de plusieurs paliers d'un même
 * type). Purement indicatif (CLAUDE.md §8) — le serveur reste seul juge au moment de `passer`.
 */
export function calculerReductionArticle(article: ArticlePanier): {
  quantiteOfferte: number;
  pourcentageApplique: number | null;
} {
  const regles = (article.reglesReduction ?? []).filter((r) => r.actif);
  const reglesOffertes = regles.filter(
    (r) => r.type_reduction === "article_offert" && r.seuil_quantite <= article.quantite,
  );
  const reglesPourcentage = regles.filter(
    (r) => r.type_reduction === "pourcentage" && r.seuil_quantite <= article.quantite,
  );
  const meilleureOfferte = reglesOffertes.reduce<RegleReduction | null>(
    (max, r) => (!max || r.seuil_quantite > max.seuil_quantite ? r : max),
    null,
  );
  const meilleurPourcentage = reglesPourcentage.reduce<RegleReduction | null>(
    (max, r) => (!max || r.seuil_quantite > max.seuil_quantite ? r : max),
    null,
  );
  return {
    quantiteOfferte: meilleureOfferte
      ? Math.floor(article.quantite / meilleureOfferte.seuil_quantite)
      : 0,
    pourcentageApplique: meilleurPourcentage?.pourcentage ?? null,
  };
}

/** Sous-total net (après réduction quantité indicative) d'un seul article — voir
 * `calculerReductionArticle`. */
export function sousTotalNetArticle(article: ArticlePanier): number {
  const prixUnitaire = Number(article.prixUnitaire);
  const { quantiteOfferte, pourcentageApplique } = calculerReductionArticle(article);
  const quantitePayee = Math.max(article.quantite - quantiteOfferte, 0);
  const sousTotalApresCadeau = prixUnitaire * quantitePayee;
  return pourcentageApplique
    ? sousTotalApresCadeau * ((100 - pourcentageApplique) / 100)
    : sousTotalApresCadeau;
}

/** Total du panier NET des réductions quantité indicatives — à préférer à `totalPanier` (brut)
 * partout où un montant "réellement à payer" est affiché (PanierCommandePage). Identique à
 * `totalPanier` tant qu'aucun palier n'est atteint. */
export function totalPanierNet(articles: ArticlePanier[]): number {
  return articles.reduce((total, a) => total + sousTotalNetArticle(a), 0);
}
