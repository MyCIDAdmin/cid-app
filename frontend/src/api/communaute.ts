/**
 * Client API — module communaute, lot Fil d'actualité + Forum (TDD §2.4,
 * backend/apps/communaute/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  CategorieForum,
  Commentaire,
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
