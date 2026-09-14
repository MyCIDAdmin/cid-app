/**
 * Hooks React Query — module evenements.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as evenementsApi from "../api/evenements";
import type {
  CovoituragePayload,
  EvenementPayload,
  InscrirePayload,
  RejoindreTrajetPayload,
} from "../types/evenements";

const evenementsKeys = {
  all: ["evenements"] as const,
  evenements: (filtres: evenementsApi.EvenementsFiltres = {}) =>
    [...evenementsKeys.all, "evenements", filtres] as const,
  inscriptions: (filtres: evenementsApi.InscriptionsFiltres = {}) =>
    [...evenementsKeys.all, "inscriptions", filtres] as const,
  covoiturages: (filtres: evenementsApi.CovoituragesFiltres = {}) =>
    [...evenementsKeys.all, "covoiturages", filtres] as const,
  reservationsCovoiturage: (filtres: evenementsApi.ReservationsCovoiturageFiltres = {}) =>
    [...evenementsKeys.all, "reservations-covoiturage", filtres] as const,
};

export function useEvenements(filtres: evenementsApi.EvenementsFiltres = {}) {
  return useQuery({
    queryKey: evenementsKeys.evenements(filtres),
    queryFn: () => evenementsApi.listEvenements(filtres),
  });
}

function invalidateEvenements(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...evenementsKeys.all, "evenements"] });
}

export function useCreerEvenement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EvenementPayload) => evenementsApi.creerEvenement(payload),
    onSuccess: () => invalidateEvenements(queryClient),
  });
}

export function useModifierEvenement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<EvenementPayload> }) =>
      evenementsApi.modifierEvenement(id, payload),
    onSuccess: () => invalidateEvenements(queryClient),
  });
}

export function usePublierEvenement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => evenementsApi.publierEvenement(id),
    onSuccess: () => invalidateEvenements(queryClient),
  });
}

export function useAnnulerEvenement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => evenementsApi.annulerEvenement(id),
    onSuccess: () => invalidateEvenements(queryClient),
  });
}

function invalidateInscriptions(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...evenementsKeys.all, "inscriptions"] });
}

/**
 * `inscrire` modifie aussi places_reservees/places_restantes de l'événement concerné — on
 * invalide donc les deux caches, même principe que usePasserCommande (boutique) sur le stock.
 */
export function useInscrire() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InscrirePayload) => evenementsApi.inscrire(payload),
    onSuccess: () => {
      invalidateInscriptions(queryClient);
      invalidateEvenements(queryClient);
    },
  });
}

export function useInscriptions(filtres: evenementsApi.InscriptionsFiltres = {}) {
  return useQuery({
    queryKey: evenementsKeys.inscriptions(filtres),
    queryFn: () => evenementsApi.listInscriptions(filtres),
  });
}

export function useAnnulerInscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => evenementsApi.annulerInscription(id),
    onSuccess: () => {
      invalidateInscriptions(queryClient);
      invalidateEvenements(queryClient);
    },
  });
}

export function useCovoiturages(filtres: evenementsApi.CovoituragesFiltres = {}) {
  return useQuery({
    queryKey: evenementsKeys.covoiturages(filtres),
    queryFn: () => evenementsApi.listCovoiturages(filtres),
  });
}

function invalidateCovoiturages(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...evenementsKeys.all, "covoiturages"] });
}

export function useCreerCovoiturage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CovoituragePayload) => evenementsApi.creerCovoiturage(payload),
    onSuccess: () => invalidateCovoiturages(queryClient),
  });
}

export function useModifierCovoiturage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CovoituragePayload> }) =>
      evenementsApi.modifierCovoiturage(id, payload),
    onSuccess: () => invalidateCovoiturages(queryClient),
  });
}

export function useSupprimerCovoiturage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => evenementsApi.supprimerCovoiturage(id),
    onSuccess: () => invalidateCovoiturages(queryClient),
  });
}

export function useRejoindreTrajet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejoindreTrajetPayload }) =>
      evenementsApi.rejoindreTrajet(id, payload),
    onSuccess: () => {
      invalidateCovoiturages(queryClient);
      queryClient.invalidateQueries({
        queryKey: [...evenementsKeys.all, "reservations-covoiturage"],
      });
    },
  });
}

export function useReservationsCovoiturage(
  filtres: evenementsApi.ReservationsCovoiturageFiltres = {},
) {
  return useQuery({
    queryKey: evenementsKeys.reservationsCovoiturage(filtres),
    queryFn: () => evenementsApi.listReservationsCovoiturage(filtres),
  });
}
