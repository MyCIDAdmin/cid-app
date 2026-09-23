/**
 * Hooks React Query — app rbac (Modul Rollenverwaltung, Phase C).
 * Toute mutation de rôle/cellule invalide la query `matrice` (seule source de vérité côté
 * frontend, voir api/rbac.ts) — jamais une query "liste des rôles" séparée qui n'existe pas ici.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as rbacApi from "../api/rbac";
import type { CreerRolePayload, ModifierRolePayload, SetMatriceCellulePayload } from "../types/rbac";

const rbacKeys = {
  all: ["rbac"] as const,
  matrice: () => [...rbacKeys.all, "matrice"] as const,
  rolesUtilisateur: (userId: string) => [...rbacKeys.all, "utilisateur", userId] as const,
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
