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

export interface ArticlePanier {
  varianteId: string;
  produitId: string;
  nom: string;
  taille: string;
  couleur: string;
  prixUnitaire: string;
  stockDisponible: number;
  quantite: number;
}

interface PanierState {
  articles: ArticlePanier[];
  ajouter: (article: Omit<ArticlePanier, "quantite">, quantite?: number) => void;
  changerQuantite: (varianteId: string, quantite: number) => void;
  retirer: (varianteId: string) => void;
  vider: () => void;
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
