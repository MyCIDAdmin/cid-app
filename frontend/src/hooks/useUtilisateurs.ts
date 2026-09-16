/**
 * Hooks React Query — gestion des rôles utilisateurs (SCD §4.2).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as utilisateursApi from "../api/utilisateurs";
import type { CidUser } from "../store/authStore";

const utilisateursKeys = {
  all: ["utilisateurs"] as const,
  list: (q: string, pageUrl: string | null) =>
    [...utilisateursKeys.all, "list", q, pageUrl] as const,
};

export function useUtilisateursList(q: string, pageUrl: string | null) {
  return useQuery({
    queryKey: utilisateursKeys.list(q, pageUrl),
    queryFn: () =>
      pageUrl
        ? utilisateursApi.getUtilisateursPage(pageUrl)
        : utilisateursApi.listUtilisateurs(q),
    placeholderData: keepPreviousData,
  });
}

export function useChangerRoleUtilisateur() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: CidUser["role"] }) =>
      utilisateursApi.changerRoleUtilisateur(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: utilisateursKeys.all }),
  });
}
