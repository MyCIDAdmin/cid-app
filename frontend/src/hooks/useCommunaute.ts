/**
 * Hooks React Query — module communaute, lot Fil d'actualité + Forum.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as communauteApi from "../api/communaute";
import type {
  AlbumPayload,
  GroupeChatPayload,
  MatchMiseAJourPayload,
  MatchPayload,
  PhotoUploadPayload,
  PublicationPayload,
  SujetPayload,
} from "../types/communaute";

const communauteKeys = {
  all: ["communaute"] as const,
  publications: (filtres: communauteApi.PublicationsFiltres = {}) =>
    [...communauteKeys.all, "publications", filtres] as const,
  sujets: (filtres: communauteApi.SujetsFiltres = {}) =>
    [...communauteKeys.all, "sujets", filtres] as const,
  sujet: (id: string) => [...communauteKeys.all, "sujet", id] as const,
  conversations: () => [...communauteKeys.all, "conversations"] as const,
  messagesPrives: (conversationId: string) =>
    [...communauteKeys.all, "messages-prives", conversationId] as const,
  groupes: (filtres: communauteApi.GroupesFiltres = {}) =>
    [...communauteKeys.all, "groupes", filtres] as const,
  groupe: (id: string) => [...communauteKeys.all, "groupe", id] as const,
  messagesGroupe: (groupeId: string) =>
    [...communauteKeys.all, "messages-groupe", groupeId] as const,
  matchs: (filtres: communauteApi.MatchsFiltres = {}) =>
    [...communauteKeys.all, "matchs", filtres] as const,
  match: (id: string) => [...communauteKeys.all, "match", id] as const,
  matchCommentaires: (matchId: string) =>
    [...communauteKeys.all, "match-commentaires", matchId] as const,
  albums: (filtres: communauteApi.AlbumsFiltres = {}) =>
    [...communauteKeys.all, "albums", filtres] as const,
  album: (id: string) => [...communauteKeys.all, "album", id] as const,
  photos: (filtres: communauteApi.PhotosFiltres = {}) =>
    [...communauteKeys.all, "photos", filtres] as const,
  quizListe: (filtres: communauteApi.QuizFiltres = {}) =>
    [...communauteKeys.all, "quiz-liste", filtres] as const,
  quiz: (id: string) => [...communauteKeys.all, "quiz", id] as const,
  classementQuiz: (id: string) => [...communauteKeys.all, "quiz-classement", id] as const,
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

// --- Messagerie privée (REST = historique seul, voir hooks/useMessagerieSocket.ts) ---

export function useConversations() {
  return useQuery({
    queryKey: communauteKeys.conversations(),
    queryFn: () => communauteApi.listConversations(),
  });
}

export function useCreerConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (destinataire: string) => communauteApi.creerConversation(destinataire),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: communauteKeys.conversations() }),
  });
}

export function useMessagesPrives(conversationId: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.messagesPrives(conversationId ?? ""),
    queryFn: () => communauteApi.listMessagesPrives(conversationId as string),
    enabled: !!conversationId,
  });
}

// --- Groupes de chat (REST = liste/gestion, voir hooks/useGroupeChatSocket.ts pour l'envoi) ---

function invalidateGroupes(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "groupes"] });
}

export function useGroupes(filtres: communauteApi.GroupesFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.groupes(filtres),
    queryFn: () => communauteApi.listGroupes(filtres),
  });
}

export function useGroupe(id: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.groupe(id ?? ""),
    queryFn: () => communauteApi.getGroupe(id as string),
    enabled: !!id,
  });
}

export function useCreerGroupe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GroupeChatPayload) => communauteApi.creerGroupe(payload),
    onSuccess: () => invalidateGroupes(queryClient),
  });
}

function invalidateGroupe(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: communauteKeys.groupe(id) });
  invalidateGroupes(queryClient);
}

export function useRejoindreGroupe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.rejoindreGroupe(id),
    onSuccess: (_data, id) => invalidateGroupe(queryClient, id),
  });
}

export function useQuitterGroupe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.quitterGroupe(id),
    onSuccess: (_data, id) => invalidateGroupe(queryClient, id),
  });
}

export function useInviterAuGroupe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, membres }: { id: string; membres: string[] }) =>
      communauteApi.inviterAuGroupe(id, membres),
    onSuccess: (_data, variables) => invalidateGroupe(queryClient, variables.id),
  });
}

export function useMessagesGroupe(groupeId: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.messagesGroupe(groupeId ?? ""),
    queryFn: () => communauteApi.listMessagesGroupe(groupeId as string),
    enabled: !!groupeId,
  });
}

// --- Live Match (REST = gestion/historique, voir hooks/useLiveMatchSocket.ts pour les
// commentaires/réactions temps réel — troisième lot, Phase 4B) ---

export function useMatchs(filtres: communauteApi.MatchsFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.matchs(filtres),
    queryFn: () => communauteApi.listMatchs(filtres),
  });
}

export function useMatch(id: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.match(id ?? ""),
    queryFn: () => communauteApi.getMatch(id as string),
    enabled: !!id,
  });
}

export function useCreerMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MatchPayload) => communauteApi.creerMatch(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "matchs"] }),
  });
}

export function useModifierMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: MatchMiseAJourPayload }) =>
      communauteApi.modifierMatch(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: communauteKeys.match(variables.id) });
      queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "matchs"] });
    },
  });
}

export function useMatchCommentaires(matchId: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.matchCommentaires(matchId ?? ""),
    queryFn: () => communauteApi.listMatchCommentaires(matchId as string),
    enabled: !!matchId,
  });
}

// --- Albums photos (troisième lot, Phase 4B) ---

export function useAlbums(filtres: communauteApi.AlbumsFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.albums(filtres),
    queryFn: () => communauteApi.listAlbums(filtres),
  });
}

export function useAlbum(id: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.album(id ?? ""),
    queryFn: () => communauteApi.getAlbum(id as string),
    enabled: !!id,
  });
}

export function useCreerAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AlbumPayload) => communauteApi.creerAlbum(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "albums"] }),
  });
}

export function usePhotos(filtres: communauteApi.PhotosFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.photos(filtres),
    queryFn: () => communauteApi.listPhotos(filtres),
    enabled: !!filtres.album,
  });
}

function invalidatePhotos(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "photos"] });
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "albums"] });
}

export function useUploaderPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PhotoUploadPayload) => communauteApi.uploaderPhoto(payload),
    onSuccess: () => invalidatePhotos(queryClient),
  });
}

export function useSupprimerPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerPhoto(id),
    onSuccess: () => invalidatePhotos(queryClient),
  });
}

export function useLikerPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.likerPhoto(id),
    onSuccess: () => invalidatePhotos(queryClient),
  });
}

export function useMasquerPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.masquerPhoto(id),
    onSuccess: () => invalidatePhotos(queryClient),
  });
}

export function useCommenterPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId, contenu }: { photoId: string; contenu: string }) =>
      communauteApi.commenterPhoto(photoId, contenu),
    onSuccess: () => invalidatePhotos(queryClient),
  });
}

// --- Quiz (troisième lot, Phase 4B) ---

export function useQuizListe(filtres: communauteApi.QuizFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.quizListe(filtres),
    queryFn: () => communauteApi.listQuiz(filtres),
  });
}

export function useQuiz(id: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.quiz(id ?? ""),
    queryFn: () => communauteApi.getQuiz(id as string),
    enabled: !!id,
  });
}

function invalidateQuiz(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: communauteKeys.quiz(id) });
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "quiz-liste"] });
}

export function useDemarrerQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.demarrerQuiz(id),
    onSuccess: (_data, id) => invalidateQuiz(queryClient, id),
  });
}

export function useRepondreQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      quizId,
      question,
      choix,
    }: {
      quizId: string;
      question: string;
      choix: string;
    }) => communauteApi.repondreQuiz(quizId, question, choix),
    onSuccess: (_data, variables) => invalidateQuiz(queryClient, variables.quizId),
  });
}

export function useClassementQuiz(id: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.classementQuiz(id ?? ""),
    queryFn: () => communauteApi.classementQuiz(id as string),
    enabled: !!id,
  });
}
