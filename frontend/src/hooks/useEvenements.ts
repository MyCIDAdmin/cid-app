/**
 * Hooks React Query — module evenements.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as evenementsApi from "../api/evenements";
import type {
  CovoituragePayload,
  EvenementPayload,
  InscrireEspecesPayload,
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

/** Téléversement de l'image de kachel (demande utilisateur 2026-09-27, point 11.1) — même
 * principe que useTeleverserImageProduit (hooks/useBoutique.ts). */
export function useTeleverserImageEvenement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fichier }: { id: string; fichier: File }) =>
      evenementsApi.televerserImageEvenement(id, fichier),
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

/**
 * Inscription payante par le Directeur Financier/Admin pour un AUTRE membre, réglée cash sur
 * place (retour utilisateur du 2026-09-21, voir apps.evenements.views.EvenementViewSet.
 * inscrire_especes) — invalide aussi la clé racine "cotisations" (littérale : cotisationsKeys
 * n'est pas exportée par useCotisations.ts) puisqu'une Cotisation est créée/confirmée payee en
 * plus de l'Inscription, exactement comme useEnregistrerPaiementEspeces le fait déjà côté
 * cotisations pour les autres types d'article.
 */
export function useInscrireEspeces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InscrireEspecesPayload) => evenementsApi.inscrireEspeces(payload),
    onSuccess: () => {
      invalidateInscriptions(queryClient);
      invalidateEvenements(queryClient);
      queryClient.invalidateQueries({ queryKey: ["cotisations"] });
    },
  });
}

/**
 * `options.enabled` (ajouté le 2026-09-26, Phase D page d'accueil publique) : PublicEvenementsTab
 * l'appelle avec `enabled: isAuthenticated` pour éviter un appel réseau voué à un 401 (Inscription
 * Permission exige un authentifié) tant que le visiteur du sous-onglet "Meine Anmeldungen" n'est
 * pas connecté — même principe que useMesSouscriptions (voir useAdhesions.ts). EvenementsPage
 * (réservée aux membres connectés) continue de l'appeler sans options, comportement inchangé.
 */
export function useInscriptions(
  filtres: evenementsApi.InscriptionsFiltres = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: evenementsKeys.inscriptions(filtres),
    queryFn: () => evenementsApi.listInscriptions(filtres),
    enabled: options.enabled ?? true,
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
