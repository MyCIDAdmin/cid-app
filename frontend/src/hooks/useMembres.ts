/**
 * Hooks React Query — module membres. Une seule clé de cache racine
 * ("membres") invalidée après chaque mutation : le volume (~300 fiches) ne
 * justifie pas une invalidation plus fine pour l'instant.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as membresApi from "../api/membres";
import type { MembresListFilters } from "../api/membres";
import type { MembreFormValues, StatutMembre } from "../types/membre";

const membresKeys = {
  all: ["membres"] as const,
  list: (filters: MembresListFilters, pageUrl: string | null) =>
    [...membresKeys.all, "list", filters, pageUrl] as const,
  detail: (id: string) => [...membresKeys.all, "detail", id] as const,
};

export function useMembresList(
  filters: MembresListFilters,
  pageUrl: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: membresKeys.list(filters, pageUrl),
    queryFn: () => (pageUrl ? membresApi.getMembresPage(pageUrl) : membresApi.listMembres(filters)),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useMembre(id: string | undefined) {
  return useQuery({
    queryKey: membresKeys.detail(id ?? ""),
    queryFn: () => membresApi.getMembre(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateMembre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: MembreFormValues) => membresApi.createMembre(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useUpdateMembre(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<MembreFormValues>) => membresApi.updateMembre(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useDeleteMembre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => membresApi.deleteMembre(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useChangerStatutMembre(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statut: StatutMembre) => membresApi.changerStatutMembre(id, statut),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useImporterMembres() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fichier: File) => membresApi.importerMembres(fichier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}
