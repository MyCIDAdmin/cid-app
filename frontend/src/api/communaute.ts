/**
 * Client API — module communaute, lot Fil d'actualité + Forum (TDD §2.4,
 * backend/apps/communaute/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  Album,
  AlbumPayload,
  CategorieForum,
  Commentaire,
  Conversation,
  GroupeChat,
  GroupeChatPayload,
  Match,
  MatchCommentaire,
  MatchMiseAJourPayload,
  MatchPayload,
  MessageGroupe,
  MessagePrive,
  ParticipationQuiz,
  Photo,
  PhotoCommentaire,
  PhotoUploadPayload,
  Publication,
  PublicationPayload,
  Quiz,
  QuizClassement,
  ReponseForum,
  ReponseQuiz,
  Sujet,
  SujetPayload,
} from "../types/communaute";

// --- Fil d'actualité ---

export interface PublicationsFiltres {
  hashtag?: string;
  auteur?: string;
  cursor?: string;
}

export async function listPublications(
  filtres: PublicationsFiltres = {},
): Promise<CursorPage<Publication>> {
  const { data } = await apiClient.get<CursorPage<Publication>>("/communaute/publications/", {
    params: filtres,
  });
  return data;
}

export async function creerPublication(payload: PublicationPayload): Promise<Publication> {
  if (payload.image) {
    const formData = new FormData();
    formData.append("contenu", payload.contenu);
    formData.append("image", payload.image);
    const { data } = await apiClient.post<Publication>("/communaute/publications/", formData);
    return data;
  }
  const { data } = await apiClient.post<Publication>("/communaute/publications/", {
    contenu: payload.contenu,
  });
  return data;
}

export async function supprimerPublication(id: string): Promise<void> {
  await apiClient.delete(`/communaute/publications/${id}/`);
}

export async function likerPublication(id: string): Promise<Publication> {
  const { data } = await apiClient.post<Publication>(`/communaute/publications/${id}/liker/`);
  return data;
}

export async function partagerPublication(id: string): Promise<Publication> {
  const { data } = await apiClient.post<Publication>(`/communaute/publications/${id}/partager/`);
  return data;
}

export async function masquerPublication(id: string, motif?: string): Promise<Publication> {
  const { data } = await apiClient.post<Publication>(`/communaute/publications/${id}/masquer/`, {
    motif,
  });
  return data;
}

export async function commenterPublication(
  publicationId: string,
  contenu: string,
  parent?: string,
): Promise<Commentaire> {
  const { data } = await apiClient.post<Commentaire>("/communaute/commentaires/", {
    publication: publicationId,
    contenu,
    parent,
  });
  return data;
}

export async function supprimerCommentaire(id: string): Promise<void> {
  await apiClient.delete(`/communaute/commentaires/${id}/`);
}

export async function masquerCommentaire(id: string): Promise<Commentaire> {
  const { data } = await apiClient.post<Commentaire>(`/communaute/commentaires/${id}/masquer/`);
  return data;
}

// --- Forum ---

export interface SujetsFiltres {
  categorie?: CategorieForum;
  auteur?: string;
  cursor?: string;
}

export async function listSujets(filtres: SujetsFiltres = {}): Promise<CursorPage<Sujet>> {
  const { data } = await apiClient.get<CursorPage<Sujet>>("/communaute/sujets/", {
    params: filtres,
  });
  return data;
}

export async function getSujet(id: string): Promise<Sujet> {
  const { data } = await apiClient.get<Sujet>(`/communaute/sujets/${id}/`);
  return data;
}

export async function creerSujet(payload: SujetPayload): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>("/communaute/sujets/", payload);
  return data;
}

export async function supprimerSujet(id: string): Promise<void> {
  await apiClient.delete(`/communaute/sujets/${id}/`);
}

export async function epinglerSujet(id: string): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>(`/communaute/sujets/${id}/epingler/`);
  return data;
}

export async function verrouillerSujet(id: string): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>(`/communaute/sujets/${id}/verrouiller/`);
  return data;
}

export async function masquerSujet(id: string, motif?: string): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>(`/communaute/sujets/${id}/masquer/`, { motif });
  return data;
}

export async function repondreAuSujet(sujetId: string, contenu: string): Promise<ReponseForum> {
  const { data } = await apiClient.post<ReponseForum>("/communaute/reponses-forum/", {
    sujet: sujetId,
    contenu,
  });
  return data;
}

export async function supprimerReponseForum(id: string): Promise<void> {
  await apiClient.delete(`/communaute/reponses-forum/${id}/`);
}

export async function masquerReponseForum(id: string): Promise<ReponseForum> {
  const { data } = await apiClient.post<ReponseForum>(`/communaute/reponses-forum/${id}/masquer/`);
  return data;
}

// --- Messagerie privée (REST = historique seul, voir hooks/useMessagerieSocket.ts) ---

export async function listConversations(
  cursor?: string,
): Promise<CursorPage<Conversation>> {
  const { data } = await apiClient.get<CursorPage<Conversation>>("/communaute/conversations/", {
    params: { cursor },
  });
  return data;
}

export async function creerConversation(destinataire: string): Promise<Conversation> {
  const { data } = await apiClient.post<Conversation>("/communaute/conversations/", {
    destinataire,
  });
  return data;
}

export async function listMessagesPrives(
  conversationId: string,
  cursor?: string,
): Promise<CursorPage<MessagePrive>> {
  const { data } = await apiClient.get<CursorPage<MessagePrive>>("/communaute/messages-prives/", {
    params: { conversation: conversationId, cursor },
  });
  return data;
}

// --- Groupes de chat (REST = liste/gestion, voir hooks/useGroupeChatSocket.ts pour l'envoi) ---

export interface GroupesFiltres {
  cursor?: string;
}

export async function listGroupes(filtres: GroupesFiltres = {}): Promise<CursorPage<GroupeChat>> {
  const { data } = await apiClient.get<CursorPage<GroupeChat>>("/communaute/groupes/", {
    params: filtres,
  });
  return data;
}

export async function getGroupe(id: string): Promise<GroupeChat> {
  const { data } = await apiClient.get<GroupeChat>(`/communaute/groupes/${id}/`);
  return data;
}

export async function creerGroupe(payload: GroupeChatPayload): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>("/communaute/groupes/", payload);
  return data;
}

export async function rejoindreGroupe(id: string): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>(`/communaute/groupes/${id}/rejoindre/`);
  return data;
}

export async function quitterGroupe(id: string): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>(`/communaute/groupes/${id}/quitter/`);
  return data;
}

export async function inviterAuGroupe(id: string, membres: string[]): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>(`/communaute/groupes/${id}/inviter/`, {
    membres,
  });
  return data;
}

export async function listMessagesGroupe(
  groupeId: string,
  cursor?: string,
): Promise<CursorPage<MessageGroupe>> {
  const { data } = await apiClient.get<CursorPage<MessageGroupe>>(
    "/communaute/messages-groupe/",
    { params: { groupe: groupeId, cursor } },
  );
  return data;
}

// --- Live Match (REST = gestion/historique, voir hooks/useLiveMatchSocket.ts pour les
// commentaires/réactions temps réel — troisième lot, Phase 4B) ---

export interface MatchsFiltres {
  cursor?: string;
}

export async function listMatchs(filtres: MatchsFiltres = {}): Promise<CursorPage<Match>> {
  const { data } = await apiClient.get<CursorPage<Match>>("/communaute/matchs/", {
    params: filtres,
  });
  return data;
}

export async function getMatch(id: string): Promise<Match> {
  const { data } = await apiClient.get<Match>(`/communaute/matchs/${id}/`);
  return data;
}

export async function creerMatch(payload: MatchPayload): Promise<Match> {
  const { data } = await apiClient.post<Match>("/communaute/matchs/", payload);
  return data;
}

export async function modifierMatch(id: string, payload: MatchMiseAJourPayload): Promise<Match> {
  const { data } = await apiClient.patch<Match>(`/communaute/matchs/${id}/`, payload);
  return data;
}

export async function listMatchCommentaires(
  matchId: string,
  cursor?: string,
): Promise<CursorPage<MatchCommentaire>> {
  const { data } = await apiClient.get<CursorPage<MatchCommentaire>>(
    "/communaute/match-commentaires/",
    { params: { match: matchId, cursor } },
  );
  return data;
}

// --- Albums photos (troisième lot, Phase 4B) ---

export interface AlbumsFiltres {
  cursor?: string;
}

export async function listAlbums(filtres: AlbumsFiltres = {}): Promise<CursorPage<Album>> {
  const { data } = await apiClient.get<CursorPage<Album>>("/communaute/albums/", {
    params: filtres,
  });
  return data;
}

export async function getAlbum(id: string): Promise<Album> {
  const { data } = await apiClient.get<Album>(`/communaute/albums/${id}/`);
  return data;
}

export async function creerAlbum(payload: AlbumPayload): Promise<Album> {
  const { data } = await apiClient.post<Album>("/communaute/albums/", payload);
  return data;
}

export interface PhotosFiltres {
  album?: string;
  cursor?: string;
}

export async function listPhotos(filtres: PhotosFiltres = {}): Promise<CursorPage<Photo>> {
  const { data } = await apiClient.get<CursorPage<Photo>>("/communaute/photos/", {
    params: filtres,
  });
  return data;
}

export async function uploaderPhoto(payload: PhotoUploadPayload): Promise<Photo> {
  const formData = new FormData();
  formData.append("album", payload.album);
  formData.append("image", payload.image);
  if (payload.legende) formData.append("legende", payload.legende);
  const { data } = await apiClient.post<Photo>("/communaute/photos/", formData);
  return data;
}

export async function supprimerPhoto(id: string): Promise<void> {
  await apiClient.delete(`/communaute/photos/${id}/`);
}

export async function likerPhoto(id: string): Promise<Photo> {
  const { data } = await apiClient.post<Photo>(`/communaute/photos/${id}/liker/`);
  return data;
}

export async function masquerPhoto(id: string): Promise<Photo> {
  const { data } = await apiClient.post<Photo>(`/communaute/photos/${id}/masquer/`);
  return data;
}

export async function commenterPhoto(photoId: string, contenu: string): Promise<PhotoCommentaire> {
  const { data } = await apiClient.post<PhotoCommentaire>("/communaute/photo-commentaires/", {
    photo: photoId,
    contenu,
  });
  return data;
}

// --- Quiz (troisième lot, Phase 4B) ---

export interface QuizFiltres {
  cursor?: string;
}

export async function listQuiz(filtres: QuizFiltres = {}): Promise<CursorPage<Quiz>> {
  const { data } = await apiClient.get<CursorPage<Quiz>>("/communaute/quiz/", {
    params: filtres,
  });
  return data;
}

export async function getQuiz(id: string): Promise<Quiz> {
  const { data } = await apiClient.get<Quiz>(`/communaute/quiz/${id}/`);
  return data;
}

export async function demarrerQuiz(id: string): Promise<ParticipationQuiz> {
  const { data } = await apiClient.post<ParticipationQuiz>(`/communaute/quiz/${id}/demarrer/`);
  return data;
}

export async function repondreQuiz(
  quizId: string,
  question: string,
  choix: string,
): Promise<ReponseQuiz> {
  const { data } = await apiClient.post<ReponseQuiz>(`/communaute/quiz/${quizId}/repondre/`, {
    question,
    choix,
  });
  return data;
}

export async function classementQuiz(id: string): Promise<QuizClassement> {
  const { data } = await apiClient.get<QuizClassement>(`/communaute/quiz/${id}/classement/`);
  return data;
}
