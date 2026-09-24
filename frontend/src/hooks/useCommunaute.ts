/**
 * Hooks React Query — module communaute, lot Fil d'actualité + Forum.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as communauteApi from "../api/communaute";
import type {
  AlbumPayload,
  ChoixQuestionPayload,
  GroupeChatPayload,
  MatchEvenementPayload,
  MatchMiseAJourPayload,
  MatchPayload,
  PhotoUploadPayload,
  PublicationPayload,
  QuestionQuizPayload,
  QuizMiseAJourPayload,
  QuizPayload,
  SujetPayload,
  TippspielPayload,
  TippspielTipPayload,
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
  classement: () => [...communauteKeys.all, "classement"] as const,
  calendrier: () => [...communauteKeys.all, "calendrier"] as const,
  statistiquesJoueurs: () => [...communauteKeys.all, "statistiques-joueurs"] as const,
  matchEvenements: (matchId: string) =>
    [...communauteKeys.all, "match-evenements", matchId] as const,
  albums: (filtres: communauteApi.AlbumsFiltres = {}) =>
    [...communauteKeys.all, "albums", filtres] as const,
  album: (id: string) => [...communauteKeys.all, "album", id] as const,
  photos: (filtres: communauteApi.PhotosFiltres = {}) =>
    [...communauteKeys.all, "photos", filtres] as const,
  quizListe: (filtres: communauteApi.QuizFiltres = {}) =>
    [...communauteKeys.all, "quiz-liste", filtres] as const,
  quiz: (id: string) => [...communauteKeys.all, "quiz", id] as const,
  classementQuiz: (id: string) => [...communauteKeys.all, "quiz-classement", id] as const,
  tippspiele: (filtres: communauteApi.TippspieleFiltres = {}) =>
    [...communauteKeys.all, "tippspiele", filtres] as const,
  tippspielTeilnahmen: (filtres: communauteApi.TippspielTeilnahmenFiltres) =>
    [...communauteKeys.all, "tippspiel-teilnahmen", filtres] as const,
  tippspielTipps: (filtres: communauteApi.TippspielTippsFiltres = {}) =>
    [...communauteKeys.all, "tippspiel-tipps", filtres] as const,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: communauteKeys.conversations() }),
  });
}

export function useMessagesPrives(conversationId: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.messagesPrives(conversationId ?? ""),
    queryFn: () => communauteApi.listMessagesPrives(conversationId as string),
    enabled: !!conversationId,
  });
}

export function useSupprimerMessagePrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerMessagePrive(id),
    // Invalide tout l'historique en cache (pas seulement la conversation courante) — même
    // principe que invalidatePublications ; la suppression en temps réel affichée à l'écran
    // passe elle par le WebSocket (voir hooks/useMessagerieSocket.ts), cette invalidation
    // n'est qu'un filet de sécurité pour un rechargement ultérieur.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "messages-prives"] }),
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

export function useSupprimerGroupe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerGroupe(id),
    onSuccess: () => invalidateGroupes(queryClient),
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

export function useSupprimerMessageGroupe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerMessageGroupe(id),
    // Même raisonnement que useSupprimerMessagePrive ci-dessus.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "messages-groupe"] }),
  });
}

// --- Recherche de membres (démarrer une conversation, inviter dans un groupe) — `q` vide
// renvoie une liste parcourable par défaut (voir communauteApi.rechercherMembres), donc pas de
// seuil de longueur minimal ici ; `enabled` reste au choix de l'appelant (ex. GroupesPage ne
// veut interroger l'annuaire que lorsque le panneau d'invitation à un groupe privé est visible,
// pas à chaque frappe dans un formulaire de groupe public). ---

export function useRechercherMembres(q: string, enabled = true) {
  return useQuery({
    queryKey: [...communauteKeys.all, "membres-recherche", q],
    queryFn: () => communauteApi.rechercherMembres(q),
    enabled,
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

// --- Fan-Club — classement/calendrier/événements (extension du Live Match, 2026-09-24) ---

export function useClassementLigue() {
  return useQuery({
    queryKey: communauteKeys.classement(),
    queryFn: () => communauteApi.listClassementLigue(),
  });
}

export function useCalendrierRencontres() {
  return useQuery({
    queryKey: communauteKeys.calendrier(),
    queryFn: () => communauteApi.listCalendrierRencontres(),
  });
}

export function useStatistiquesJoueurs() {
  return useQuery({
    queryKey: communauteKeys.statistiquesJoueurs(),
    queryFn: () => communauteApi.listStatistiquesJoueurs(),
  });
}

export function useMatchEvenements(matchId: string | undefined) {
  return useQuery({
    queryKey: communauteKeys.matchEvenements(matchId ?? ""),
    queryFn: () => communauteApi.listMatchEvenements(matchId as string),
    enabled: !!matchId,
  });
}

export function useCreerMatchEvenement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MatchEvenementPayload) => communauteApi.creerMatchEvenement(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: communauteKeys.matchEvenements(variables.match) });
    },
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

// Modifier/supprimer un album — réservées à Bureau Admin+ côté backend (AlbumPermission),
// utilisées uniquement par AdminAlbumsPage (voir docstring de tête models.py côté backend).
export function useModifierAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AlbumPayload }) =>
      communauteApi.modifierAlbum(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "albums"] });
      queryClient.invalidateQueries({ queryKey: communauteKeys.album(variables.id) });
    },
  });
}

export function useSupprimerAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerAlbum(id),
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

// --- Gestion Quiz (Bureau Admin+ — création/édition questions & choix, voir
// GestionQuizPermission côté backend ; distinct du jeu ci-dessus) ---

function invalidateQuizListe(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "quiz-liste"] });
}

export function useCreerQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: QuizPayload) => communauteApi.creerQuiz(payload),
    onSuccess: () => invalidateQuizListe(queryClient),
  });
}

export function useModifierQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: QuizMiseAJourPayload }) =>
      communauteApi.modifierQuiz(id, payload),
    onSuccess: (_data, variables) => invalidateQuiz(queryClient, variables.id),
  });
}

export function useSupprimerQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.supprimerQuiz(id),
    onSuccess: () => invalidateQuizListe(queryClient),
  });
}

export function useCreerQuestionQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: QuestionQuizPayload) => communauteApi.creerQuestionQuiz(payload),
    onSuccess: (_data, variables) => invalidateQuiz(queryClient, variables.quiz),
  });
}

export function useSupprimerQuestionQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; quizId: string }) => communauteApi.supprimerQuestionQuiz(id),
    onSuccess: (_data, variables) => invalidateQuiz(queryClient, variables.quizId),
  });
}

export function useCreerChoixQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload }: { payload: ChoixQuestionPayload; quizId: string }) =>
      communauteApi.creerChoixQuestion(payload),
    onSuccess: (_data, variables) => invalidateQuiz(queryClient, variables.quizId),
  });
}

export function useSupprimerChoixQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; quizId: string }) =>
      communauteApi.supprimerChoixQuestion(id),
    onSuccess: (_data, variables) => invalidateQuiz(queryClient, variables.quizId),
  });
}

// --- Tippspiel (pronostics Ligue 1, 2026-09-24) — onglet Ticker, voir
// components/communaute/Tippspiel*.tsx ---

function invalidateTippspiele(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "tippspiele"] });
}

function invalidateTippspielTeilnahmen(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "tippspiel-teilnahmen"] });
}

export function useTippspiele(filtres: communauteApi.TippspieleFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.tippspiele(filtres),
    queryFn: () => communauteApi.listTippspiele(filtres),
  });
}

// Réservé Administrateur App (super_admin) côté backend — voir TippspielPermission.
export function useCreerTippspiel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TippspielPayload) => communauteApi.creerTippspiel(payload),
    onSuccess: () => invalidateTippspiele(queryClient),
  });
}

export function useModifierTippspiel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TippspielPayload> }) =>
      communauteApi.modifierTippspiel(id, payload),
    onSuccess: () => invalidateTippspiele(queryClient),
  });
}

export function useTeilnehmenTippspiel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.teilnehmenTippspiel(id),
    onSuccess: () => invalidateTippspielTeilnahmen(queryClient),
  });
}

export function useTippspielTeilnahmen(filtres: communauteApi.TippspielTeilnahmenFiltres) {
  return useQuery({
    queryKey: communauteKeys.tippspielTeilnahmen(filtres),
    queryFn: () => communauteApi.listTippspielTeilnahmen(filtres),
    enabled: !!filtres.tippspiel,
  });
}

// "bestätigt vom Finanzdirektor" (retour utilisateur) — réservé Directeur Financier+.
export function useConfirmerPaiementTeilnahme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communauteApi.confirmerPaiementTeilnahme(id),
    onSuccess: () => invalidateTippspielTeilnahmen(queryClient),
  });
}

export function useTippspielTipps(filtres: communauteApi.TippspielTippsFiltres = {}) {
  return useQuery({
    queryKey: communauteKeys.tippspielTipps(filtres),
    queryFn: () => communauteApi.listTippspielTipps(filtres),
    enabled: !!filtres.tippspiel,
  });
}

function invalidateTippspielTipps(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...communauteKeys.all, "tippspiel-tipps"] });
  // Rejoindre le jeu au premier pronostic est implicite côté backend (voir
  // TippspielTipSerializer.create) — invalider aussi le classement/ma participation.
  invalidateTippspielTeilnahmen(queryClient);
}

export function useCreerTippspielTip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TippspielTipPayload) => communauteApi.creerTippspielTip(payload),
    onSuccess: () => invalidateTippspielTipps(queryClient),
  });
}

export function useModifierTippspielTip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Pick<TippspielTipPayload, "score_domicile" | "score_exterieur">;
    }) => communauteApi.modifierTippspielTip(id, payload),
    onSuccess: () => invalidateTippspielTipps(queryClient),
  });
}
