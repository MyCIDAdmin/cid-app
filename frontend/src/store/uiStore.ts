/**
 * Préférences d'interface persistées localement (localStorage — un choix d'affichage sans
 * rapport avec un compte, à la différence de authStore qui vide son état à la déconnexion ;
 * survit donc volontairement à un changement de compte dans le même navigateur, contrairement
 * au panier qui est lui limité à la session, voir panierStore.ts).
 *
 * Deux préférences pour l'instant, toutes deux nées du même problème remonté en test manuel
 * (trop de modules pour tenir à l'écran, même avec le défilement ajouté d'abord) :
 * - le repli de la sidebar entière en rail étroit (icônes seules) ;
 * - le repli par groupe (accordéon) une fois la sidebar dépliée, cf Sidebar.tsx — les groupes
 *   par défaut peu consultés (Administration) démarrent repliés, les autres ouverts. Ce choix
 *   est la seule source de vérité pour l'état déplié/replié d'un groupe (bug corrigé : une
 *   première version forçait aussi l'ouverture du groupe contenant la page active, ce qui
 *   rendait "Général" — qui contient le tableau de bord — impossible à replier en pratique).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarGroupKey = "general" | "communaute" | "contenu" | "administration";

export const DEFAULT_COLLAPSED_GROUPS: Record<SidebarGroupKey, boolean> = {
  general: false,
  communaute: false,
  contenu: false,
  // Repliée par défaut : réservée aux rôles Bureau Admin/RH/Directeur Financier, et déjà la
  // plus grande grappe (9 modules) — la replier d'entrée est ce qui évite le plus de défilement
  // pour ces rôles sans rien cacher de définitif (un clic la rouvre, préférence mémorisée).
  administration: true,
};

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  collapsedGroups: Record<SidebarGroupKey, boolean>;
  toggleGroup: (key: SidebarGroupKey) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      collapsedGroups: DEFAULT_COLLAPSED_GROUPS,
      toggleGroup: (key) =>
        set((state) => ({
          collapsedGroups: { ...state.collapsedGroups, [key]: !state.collapsedGroups[key] },
        })),
    }),
    { name: "cid-ui", storage: createJSONStorage(() => localStorage) },
  ),
);
