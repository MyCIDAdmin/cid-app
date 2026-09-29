/**
 * Hooks React Query — app rbac (Modul Rollenverwaltung, Phase C).
 * Toute mutation de rôle/cellule invalide la query `matrice` (seule source de vérité côté
 * frontend, voir api/rbac.ts) — jamais une query "liste des rôles" séparée qui n'existe pas ici.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as rbacApi from "../api/rbac";
import { useAuthStore } from "../store/authStore";
import {
  pageEstAccessible,
  pageEstModifiable,
  type CreerRolePayload,
  type ModifierRolePayload,
  type SetMatriceCellulePayload,
} from "../types/rbac";

const rbacKeys = {
  all: ["rbac"] as const,
  matrice: () => [...rbacKeys.all, "matrice"] as const,
  rolesUtilisateur: (userId: string) => [...rbacKeys.all, "utilisateur", userId] as const,
  mesAcces: () => [...rbacKeys.all, "mes-acces"] as const,
  visibiliteEffective: () => [...rbacKeys.all, "visibilite-effective"] as const,
};

export function useRbacMatrice() {
  return useQuery({
    queryKey: rbacKeys.matrice(),
    queryFn: rbacApi.getMatrice,
  });
}

export function useCreerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreerRolePayload) => rbacApi.creerRole(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKeys.matrice() }),
  });
}

export function useModifierRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ModifierRolePayload }) =>
      rbacApi.modifierRole(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKeys.matrice() }),
  });
}

export function useSupprimerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rbacApi.supprimerRole(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKeys.matrice() }),
  });
}

export function useSetMatriceCellule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetMatriceCellulePayload) => rbacApi.setMatriceCellule(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rbacKeys.matrice() }),
  });
}

export function useRolesUtilisateur(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: rbacKeys.rolesUtilisateur(userId),
    queryFn: () => rbacApi.getRolesUtilisateur(userId),
    enabled,
  });
}

export function useAssignerRolesUtilisateur() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      rbacApi.assignerRolesUtilisateur(userId, roleIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.rolesUtilisateur(variables.userId) });
      queryClient.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
  });
}

/**
 * Accès effectif de l'utilisateur courant aux 13 pages de gestion (Phase D) — utilisé par
 * RequireRole (mode `pageSlug`) et Sidebar.tsx pour le gating de navigation. `enabled:
 * isAuthenticated` : jamais appelé tant que le login n'est pas terminé (évite un 401 inutile au
 * premier rendu de LoginPage). L'Administrateur App n'a pas besoin d'attendre cette requête —
 * son accès est hartcodé côté backend ET vérifiable localement (voir RequireRole) — mais le
 * hook reste appelable pour ce rôle aussi, simplement toujours résolu à `true` en pratique.
 */
export function useMesAcces() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: rbacKeys.mesAcces(),
    queryFn: rbacApi.getMesAcces,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

/**
 * GET /rbac/visibilite-membre/effective/ (Sidebar.tsx::useSidebarNav) — bug corrigé le
 * 2026-09-28 (retour utilisateur : masquer un module dans "ModuleVisibiliteMembre" via l'admin
 * Django n'avait aucun effet, le module restait toujours affiché à un membre normal) : cet
 * endpoint backend existait déjà (IsAuthenticated seul, voir apps.rbac.views), mais aucun hook
 * frontend ne l'appelait — la Sidebar n'avait donc aucun moyen de savoir qu'un module avait été
 * masqué. Même `enabled`/`staleTime` que useMesAcces (ci-dessus), même raison : jamais interrogé
 * avant la fin du login, rafraîchi au plus une fois par minute (pas une donnée qui change souvent
 * en pratique — un Admin App la modifie ponctuellement, pas en continu).
 */
export function useVisibiliteEffective() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: rbacKeys.visibiliteEffective(),
    queryFn: rbacApi.getVisibiliteEffective,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

/**
 * Convenience hook (ajouté le 2026-09-24, task #216) au-dessus de useMesAcces() pour les 13
 * pages de gestion elles-mêmes : répond aux DEUX questions dont une page a besoin pour son
 * propre affichage — "puis-je voir cette page" (déjà tranché en amont par RequireRole/Sidebar au
 * moment où la page s'affiche, donc `accessible` vaut ~toujours `true` ici en pratique) et
 * surtout "dois-je désactiver mes contrôles d'écriture" (`modifiable`). Centralise le même
 * hartcodage Administrateur App et le même état de chargement que RequireRole/Sidebar.tsx,
 * plutôt que de le dupliquer dans chacune des 13 pages.
 */
export function usePageAccess(pageSlug: string) {
  const estSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const { data: mesAcces, isLoading } = useMesAcces();

  if (estSuperAdmin) {
    return { accessible: true, modifiable: true, isLoading: false };
  }
  const niveau = mesAcces?.[pageSlug];
  return {
    accessible: pageEstAccessible(niveau),
    modifiable: pageEstModifiable(niveau),
    isLoading,
  };
}
