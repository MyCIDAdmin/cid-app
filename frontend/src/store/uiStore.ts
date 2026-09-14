/**
 * Préférences d'interface persistées localement (localStorage — un choix d'affichage sans
 * rapport avec un compte, à la différence de authStore qui vide son état à la déconnexion ;
 * survit donc volontairement à un changement de compte dans le même navigateur, contrairement
 * au panier qui est lui limité à la session, voir panierStore.ts).
 *
 * Pour l'instant, uniquement le repli de la sidebar (bug remonté en test manuel : trop de
 * modules pour tenir à l'écran même avec le défilement ajouté, l'utilisateur veut pouvoir la
 * réduire pour gagner de la place).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    { name: "cid-ui", storage: createJSONStorage(() => localStorage) },
  ),
);
