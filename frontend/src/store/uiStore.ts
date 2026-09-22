/**
 * Préférences d'interface persistées localement (localStorage — un choix d'affichage sans
 * rapport avec un compte, à la différence de authStore qui vide son état à la déconnexion ;
 * survit donc volontairement à un changement de compte dans le même navigateur, contrairement
 * au panier qui est lui limité à la session, voir panierStore.ts).
 *
 * Trois préférences pour l'instant :
 * - le repli de la sidebar entière en rail étroit (icônes seules) ;
 * - le repli par groupe (accordéon) une fois la sidebar dépliée, cf Sidebar.tsx — les groupes
 *   par défaut peu consultés (Administration) démarrent repliés, les autres ouverts. Ce choix
 *   est la seule source de vérité pour l'état déplié/replié d'un groupe (bug corrigé : une
 *   première version forçait aussi l'ouverture du groupe contenant la page active, ce qui
 *   rendait "Général" — qui contient le tableau de bord — impossible à replier en pratique).
 * - le thème clair/sombre (demande utilisateur du 2026-09-16, "Button zu Wechseln zwischen
 *   Dunkel und Hell Modus", voir ThemeToggle.tsx) — `toggleTheme` pose/retire lui-même la
 *   classe `dark` sur <html> (Tailwind `darkMode: "class"`, voir tailwind.config.js/index.css)
 *   en plus de mettre à jour le state ; main.tsx fait le même geste de façon synchrone avant le
 *   premier rendu React (lecture directe du localStorage, le store n'existe pas encore à ce
 *   stade) pour éviter un flash en thème clair au chargement.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarGroupKey = "general" | "communaute" | "contenu" | "administration";
export type Theme = "light" | "dark";

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
  theme: Theme;
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      // true par défaut depuis la refonte du 2026-09-22 (rail + flyout par groupe, voir
      // Sidebar.tsx) : ne change rien pour qui a déjà une préférence enregistrée (localStorage),
      // mais un nouveau compte démarre désormais en rail compact plutôt qu'en sidebar dépliée.
      sidebarCollapsed: true,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      collapsedGroups: DEFAULT_COLLAPSED_GROUPS,
      toggleGroup: (key) =>
        set((state) => ({
          collapsedGroups: { ...state.collapsedGroups, [key]: !state.collapsedGroups[key] },
        })),
      theme: "light",
      toggleTheme: () =>
        set((state) => {
          const theme: Theme = state.theme === "dark" ? "light" : "dark";
          document.documentElement.classList.toggle("dark", theme === "dark");
          return { theme };
        }),
    }),
    { name: "cid-ui", storage: createJSONStorage(() => localStorage) },
  ),
);
