/**
 * Hooks React Query — module projets ("Projets & Actions"). La contribution libre elle-même
 * (demande utilisateur point 2) n'a pas de hook ici : voir
 * hooks/useCotisations.useContribuerProjet, qui invalide déjà la clé racine "projets" ci-dessous
 * après une contribution confirmée.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as projetsApi from "../api/projets";
import type {
  AufgabePayload,
  ProjetImagePayload,
  RolleProjet,
  SichtbarkeitProjet,
  StatutAufgabe,
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
  kennzahlen: () => [...projetsKeys.all, "kennzahlen"] as const,
  arbeitsbereich: (id: string) => [...projetsKeys.all, "arbeitsbereich", id] as const,
  team: (id: string) => [...projetsKeys.all, "team", id] as const,
  aufgaben: (id: string) => [...projetsKeys.all, "aufgaben", id] as const,
  kommentare: (id: string) => [...projetsKeys.all, "kommentare", id] as const,
};

export function useProjets(filtres: projetsApi.ProjetsFiltres = {}) {
  return useQuery({
    queryKey: projetsKeys.liste(filtres),
    queryFn: () => projetsApi.listProjets(filtres),
  });
}

/**
 * Kennzahlen "Donators / Gesammelt / Projekte" de la page d'accueil publique (demande
 * utilisateur du 2026-09-26, plan section C.3) — lecture ouverte à tout le monde.
 */
export function useKennzahlenProjets() {
  return useQuery({
    queryKey: projetsKeys.kennzahlen(),
    queryFn: () => projetsApi.getKennzahlenProjets(),
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

// --- Espace de travail : visibilité, équipe, tâches (2026-10-06) ---------------------------

export function useSichtbarkeitAendern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sichtbarkeit }: { id: string; sichtbarkeit: SichtbarkeitProjet }) =>
      projetsApi.aendereSichtbarkeit(id, sichtbarkeit),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useArbeitsbereich(projetId: string | undefined) {
  return useQuery({
    queryKey: projetsKeys.arbeitsbereich(projetId ?? ""),
    queryFn: () => projetsApi.getArbeitsbereich(projetId as string),
    enabled: Boolean(projetId),
  });
}

export function useTeam(projetId: string | undefined) {
  return useQuery({
    queryKey: projetsKeys.team(projetId ?? ""),
    queryFn: () => projetsApi.listTeam(projetId as string),
    enabled: Boolean(projetId),
  });
}

export function useTeamHinzufuegen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { projet: string; membre: string; rolle: RolleProjet }) =>
      projetsApi.teamHinzufuegen(payload),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useTeamRolleAendern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rolle }: { id: string; rolle: RolleProjet }) =>
      projetsApi.teamRolleAendern(id, rolle),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useTeamEntfernen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projetsApi.teamEntfernen(id),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useAufgaben(projetId: string | undefined) {
  return useQuery({
    queryKey: projetsKeys.aufgaben(projetId ?? ""),
    queryFn: () => projetsApi.listAufgaben(projetId as string),
    enabled: Boolean(projetId),
  });
}

export function useAufgabeErstellen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AufgabePayload) => projetsApi.aufgabeErstellen(payload),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useAufgabeAendern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Omit<AufgabePayload, "projet">>;
    }) => projetsApi.aufgabeAendern(id, payload),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useAufgabeLoeschen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projetsApi.aufgabeLoeschen(id),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useAufgabeVerschieben() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      position,
    }: {
      id: string;
      status: StatutAufgabe;
      position: number;
    }) => projetsApi.aufgabeVerschieben(id, status, position),
    onSettled: () => invalidateProjets(queryClient),
  });
}

export function useKommentare(aufgabeId: string | undefined) {
  return useQuery({
    queryKey: projetsKeys.kommentare(aufgabeId ?? ""),
    queryFn: () => projetsApi.listKommentare(aufgabeId as string),
    enabled: Boolean(aufgabeId),
  });
}

export function useKommentarErstellen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ aufgabe, text }: { aufgabe: string; text: string }) =>
      projetsApi.kommentarErstellen(aufgabe, text),
    onSuccess: () => invalidateProjets(queryClient),
  });
}

export function useKommentarLoeschen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projetsApi.kommentarLoeschen(id),
    onSuccess: () => invalidateProjets(queryClient),
  });
}
