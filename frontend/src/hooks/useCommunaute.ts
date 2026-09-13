/**
 * Hooks React Query — module communaute, lot Fil d'actualité + Forum.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as communauteApi from "../api/communaute";
import type { PublicationPayload, SujetPayload } from "../types/communaute";

const communauteKeys = {
  all: ["communaute"] as const,
  publications: (filtres: communauteApi.PublicationsFiltres = {}) =>
    [...communauteKeys.all, "publications", filtres] as const,
  sujets: (filtres: communauteApi.SujetsFiltres = {}) =>
    [...communauteKeys.all, "sujets", filtres] as const,
  sujet: (id: string) => [...communauteKeys.all, "sujet", id] as const,
};

function invalidatePublications(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "publications"] });
}

function invalidateSujets(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "sujets"] });
}

// --- Fil d'actualité ---

export function usePublications(filtres: communauteApi.PublicationsFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.publications(filtres),
    queryFn: () => communauteApi.listPublications(filtres),
  });
}

export function useCreerPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PublicationPayload) => communauteApi.creerPublication(payload),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

export function useSupprimerPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerPublication(id),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

export function useLikerPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.likerPublication(id),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

export function usePartagerPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.partagerPublication(id),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

export function useMasquerPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motif }: { id: string; motif?: string }) =>
      communauteApi.masquerPublication(id, motif),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

export function useCommenterPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      publicationId,
      contenu,
      parent,
    }: {
      publicationId: string;
      contenu: string;
      parent?: string;
    }) => communauteApi.commenterPublication(publicationId, contenu, parent),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

export function useSupprimerCommentaire() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerCommentaire(id),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

export function useMasquerCommentaire() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.masquerCommentaire(id),
    onSuccess: () => invalidatePublications(queryClient),
  });
}

// --- Forum ---

export function useSujets(filtres: communauteApi.SujetsFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.sujets(filtres),
    queryFn: () => communauteApi.listSujets(filtres),
  });
}

export function useSujet(id: string) {
  return useQuery({
    queryKey: communauteKeys.sujet(id),
    queryFn: () => communauteApi.getSujet(id),
    enabled: !!id,
  });
}

export function useCreerSujet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SujetPayload) => communauteApi.creerSujet(payload),
    onSuccess: () => invalidateSujets(queryClient),
  });
}

export function useSupprimerSujet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerSujet(id),
    onSuccess: () => invalidateSujets(queryClient),
  });
}

function invalidateSujet(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: communauteKeys.sujet(id) });
  invalidateSujets(queryClient);
}

export function useEpinglerSujet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.epinglerSujet(id),
    onSuccess: (_data, id) => invalidateSujet(queryClient, id),
  });
}

export function useVerrouillerSujet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.verrouillerSujet(id),
    onSuccess: (_data, id) => invalidateSujet(queryClient, id),
  });
}

export function useMasquerSujet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motif }: { id: string; motif?: string }) =>
      communauteApi.masquerSujet(id, motif),
    onSuccess: (_data, variables) => invalidateSujet(queryClient, variables.id),
  });
}

export function useRepondreAuSujet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sujetId, contenu }: { sujetId: string; contenu: string }) =>
      communauteApi.repondreAuSujet(sujetId, contenu),
    onSuccess: (_data, variables) => invalidateSujet(queryClient, variables.sujetId),
  });
}

export function useSupprimerReponseForum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; sujetId: string }) =>
      communauteApi.supprimerReponseForum(id),
    onSuccess: (_data, variables) => invalidateSujet(queryClient, variables.sujetId),
  });
}

export function useMasquerReponseForum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; sujetId: string }) => communauteApi.masquerReponseForum(id),
    onSuccess: (_data, variables) => invalidateSujet(queryClient, variables.sujetId),
  });
}
