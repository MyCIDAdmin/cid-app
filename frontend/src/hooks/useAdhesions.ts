/**
 * Hooks React Query — module adhesions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as adhesionsApi from "../api/adhesions";
import type {
  CampagneCreatePayload,
  OffreCreatePayload,
  RabaisCreatePayload,
  SouscrirePayload,
  ValiderJustificatifPayload,
} from "../types/adhesion";

const adhesionsKeys = {
  all: ["adhesions"] as const,
  campagneActive: () => [...adhesionsKeys.all, "campagne-active"] as const,
  campagnes: () => [...adhesionsKeys.all, "campagnes"] as const,
  mesSouscriptions: () => [...adhesionsKeys.all, "mes-souscriptions"] as const,
  justificatifsEnAttente: () => [...adhesionsKeys.all, "justificatifs-en-attente"] as const,
};

/** 404 attendu tant qu'aucune campagne n'est publiée — pas une erreur transitoire à retenter. */
export function useCampagneActive() {
  return useQuery({
    queryKey: adhesionsKeys.campagneActive(),
    queryFn: () => adhesionsApi.getCampagneActive(),
    retry: false,
  });
}

export function useCampagnes() {
  return useQuery({
    queryKey: adhesionsKeys.campagnes(),
    queryFn: () => adhesionsApi.listCampagnes(),
  });
}

export function useMesSouscriptions() {
  return useQuery({
    queryKey: adhesionsKeys.mesSouscriptions(),
    queryFn: () => adhesionsApi.listMesSouscriptions(),
  });
}

export function useCreerCampagne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CampagneCreatePayload) => adhesionsApi.creerCampagne(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function usePublierCampagne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.publierCampagne(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagneActive() });
    },
  });
}

export function useCloturerCampagne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.cloturerCampagne(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagneActive() });
    },
  });
}

export function useSouscrire() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SouscrirePayload) => adhesionsApi.souscrire(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() }),
  });
}

/** Upload/remplacement d'un justificatif (AHM-20) — voir adhesionsApi.uploaderJustificatif. */
export function useUploaderJustificatif() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ souscriptionId, fichier }: { souscriptionId: string; fichier: File }) =>
      adhesionsApi.uploaderJustificatif(souscriptionId, fichier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() }),
  });
}

/** File de validation RH+ (AHM-20, RICEFW R-ADH-05). */
export function useJustificatifsEnAttente() {
  return useQuery({
    queryKey: adhesionsKeys.justificatifsEnAttente(),
    queryFn: () => adhesionsApi.listSouscriptionsEnAttenteJustificatif(),
  });
}

export function useValiderJustificatif() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ValiderJustificatifPayload }) =>
      adhesionsApi.validerJustificatif(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.justificatifsEnAttente() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() });
    },
  });
}

/**
 * Gestion des offres/rabais (demande utilisateur du 2026-09-16) — CampagneAdhesionSerializer
 * niche déjà `offres`/`offres[].rabais` en entier (voir types/adhesion.ts) : il suffit
 * d'invalider adhesionsKeys.campagnes() après chaque mutation pour que la liste des campagnes
 * (et donc le panneau de gestion par campagne) reflète l'état à jour, sans requête séparée.
 */
export function useCreerOffre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OffreCreatePayload) => adhesionsApi.creerOffre(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useModifierOffre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<OffreCreatePayload> }) =>
      adhesionsApi.modifierOffre(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useSupprimerOffre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.supprimerOffre(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useCreerRabais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RabaisCreatePayload) => adhesionsApi.creerRabais(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useModifierRabais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<RabaisCreatePayload> }) =>
      adhesionsApi.modifierRabais(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useSupprimerRabais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.supprimerRabais(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

/** Stornieren/zurückziehen (demande utilisateur du 2026-09-16) — membre propriétaire ou RH+. */
export function useAnnulerSouscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.annulerSouscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.justificatifsEnAttente() });
    },
  });
}
