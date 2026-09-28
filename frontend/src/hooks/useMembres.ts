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
  moi: () => [...membresKeys.all, "moi"] as const,
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

/** Fiche du compte connecté (bouton "Mein Profil" du menu utilisateur, ajouté le 2026-09-28) —
 * `retry: false` même raisonnement que useCampagneActive (hooks/useAdhesions.ts) : un 404 ici est
 * un état attendu (aucune fiche Membre liée à ce compte), pas une erreur transitoire à retenter.
 * `enabled` (défaut true) permet à MembreFormPage de n'appeler cette requête qu'en mode profil
 * (voir MembreFormPage.tsx, qui appelle aussi useMembre — les deux hooks doivent toujours être
 * appelés sans condition, seule leur activation varie, cf règles des Hooks React). */
export function useMembreMoi(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: membresKeys.moi(),
    queryFn: membresApi.getMembreMoi,
    retry: false,
    enabled: options.enabled ?? true,
  });
}

export function useUpdateMembreMoi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<MembreFormValues>) => membresApi.updateMembreMoi(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useTeleverserPhotoMembreMoi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fichier: File) => membresApi.televerserPhotoMembreMoi(fichier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
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

/** Ajouté le 2026-09-19 — voir membresApi.importerHistoriqueStatuts. N'invalide pas la liste
 * membres (le statut COURANT n'est modifié que si l'année importée est la plus récente connue
 * pour ce membre — voir apps.membres.services.enregistrer_statut_annuel côté backend) : on
 * invalide quand même par prudence, l'import restant peu fréquent. */
export function useImporterHistoriqueStatuts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fichier: File) => membresApi.importerHistoriqueStatuts(fichier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}
