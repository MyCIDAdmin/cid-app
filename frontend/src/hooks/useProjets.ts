/**
 * Hooks React Query — module projets ("Projets & Actions"). La contribution libre elle-même
 * (demande utilisateur point 2) n'a pas de hook ici : voir
 * hooks/useCotisations.useContribuerProjet, qui invalide déjà la clé racine "projets" ci-dessous
 * après une contribution confirmée.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as projetsApi from "../api/projets";
import type {
  ProjetImagePayload,
  ProjetMiseAJourImagePayload,
  ProjetMiseAJourPayload,
  ProjetPayload,
} from "../types/projets";

const projetsKeys = {
  all: ["projets"] as const,
  liste: (filtres: projetsApi.ProjetsFiltres = {}) =>
    [...projetsKeys.all, "liste", filtres] as const,
  detail: (id: string) => [...projetsKeys.all, "detail", id] as const,
  contributeurs: (id: string) => [...projetsKeys.all, "contributeurs", id] as const,
  misesAJour: (projetId: string) => [...projetsKeys.all, "mises-a-jour", projetId] as const,
};

export function useProjets(filtres: projetsApi.ProjetsFiltres = {}) {
  return useQuery({
    queryKey: projetsKeys.liste(filtres),
    queryFn: () => projetsApi.listProjets(filtres),
  });
}

export function useProjet(id: string | undefined) {
  return useQuery({
    queryKey: projetsKeys.detail(id ?? ""),
    queryFn: () => projetsApi.getProjet(id as string),
    enabled: Boolean(id),
  });
}

function invalidateProjets(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: projetsKeys.all });
}

export function useCreerProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjetPayload) => projetsApi.creerProjet(payload),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useModifierProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ProjetPayload> }) =>
      projetsApi.modifierProjet(id, payload),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useSupprimerProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projetsApi.supprimerProjet(id),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

/** Face arrière de la kachel (demande utilisateur point 5) — chargée à la demande (au retournement
 * de la carte, voir ProjetCard), pas préchargée avec la liste. */
export function useContributeursProjet(id: string | undefined) {
  return useQuery({
    queryKey: projetsKeys.contributeurs(id ?? ""),
    queryFn: () => projetsApi.getContributeursProjet(id as string),
    enabled: Boolean(id),
  });
}

export function useAjouterImageProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjetImagePayload) => projetsApi.ajouterImageProjet(payload),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useModifierImageProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { ordre: number } }) =>
      projetsApi.modifierImageProjet(id, payload),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useSupprimerImageProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projetsApi.supprimerImageProjet(id),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useMisesAJourProjet(projetId: string | undefined) {
  return useQuery({
    queryKey: projetsKeys.misesAJour(projetId ?? ""),
    queryFn: () => projetsApi.listMisesAJourProjet(projetId as string),
    enabled: Boolean(projetId),
  });
}

function invalidateMisesAJour(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...projetsKeys.all, "mises-a-jour"] });
}

export function useCreerMiseAJourProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjetMiseAJourPayload) => projetsApi.creerMiseAJourProjet(payload),
    onSuccess: () => invalidateMisesAJour(queryClient),
  });
}

export function useModifierMiseAJourProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Pick<ProjetMiseAJourPayload, "titre" | "contenu_html">>;
    }) => projetsApi.modifierMiseAJourProjet(id, payload),
    onSuccess: () => invalidateMisesAJour(queryClient),
  });
}

export function useSupprimerMiseAJourProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projetsApi.supprimerMiseAJourProjet(id),
    onSuccess: () => invalidateMisesAJour(queryClient),
  });
}

export function useAjouterImageMiseAJourProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjetMiseAJourImagePayload) =>
      projetsApi.ajouterImageMiseAJourProjet(payload),
    onSuccess: () => invalidateMisesAJour(queryClient),
  });
}

export function useSupprimerImageMiseAJourProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projetsApi.supprimerImageMiseAJourProjet(id),
    onSuccess: () => invalidateMisesAJour(queryClient),
  });
}
