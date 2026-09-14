/**
 * Client API — module communaute, lot Fil d'actualité + Forum (TDD §2.4,
 * backend/apps/communaute/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  CategorieForum,
  Commentaire,
  Conversation,
  GroupeChat,
  GroupeChatPayload,
  MessageGroupe,
  MessagePrive,
  Publication,
  PublicationPayload,
  ReponseForum,
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
