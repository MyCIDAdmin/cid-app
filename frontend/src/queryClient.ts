/**
 * Instance QueryClient partagée, hors arbre React.
 *
 * Pourquoi ce fichier existe : authStore.ts (login/logout) a besoin de vider
 * ce cache au changement d'identité (voir juste en dessous) mais n'est pas
 * un composant React — il ne peut pas passer par useQueryClient(). En
 * exportant l'instance ici, main.tsx (Provider) et authStore.ts (clear)
 * partagent la même référence sans dépendance circulaire.
 *
 * Bug corrigé (signalé par l'utilisateur en test manuel, 2026-09-11) : un
 * membre "normal" pouvait voir le détail d'autres fiches Membre alors que
 * l'API les lui refuse (voir apps.membres.views.MembreViewSet.get_queryset
 * + tests test_retrieve_fiche_d_un_autre_membre_refuse /
 * test_list_comme_membre_ne_retourne_que_sa_propre_fiche, qui passent déjà
 * côté backend). La fuite n'était pas côté API : en l'absence de bouton de
 * déconnexion, un testeur se reconnectait avec un autre compte dans le même
 * onglet (SPA, pas de rechargement complet) ; le cache React Query
 * (staleTime 30s) gardait alors en mémoire la liste/les fiches déjà
 * chargées par le compte RH précédent et les réaffichait telles quelles au
 * compte Membre nouvellement connecté, le temps que staleTime expire.
 * Fix : vider ce cache à chaque loginSuccess()/logout() (voir authStore.ts).
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s — cf SDD §6.2 cache L4 React Query
      retry: 1,
    },
  },
});
