/**
 * Client API — module projets ("Projets & Actions", backend/apps/projets/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  Contributeur,
  Projet,
  ProjetImage,
  ProjetImagePayload,
  ProjetMiseAJour,
  ProjetMiseAJourImage,
  ProjetMiseAJourImagePayload,
  ProjetMiseAJourPayload,
  ProjetPayload,
  ProjetsKennzahlen,
  StatutProjet,
} from "../types/projets";

export interface ProjetsFiltres {
  statut?: StatutProjet;
  cursor?: string;
}

/**
 * Kacheln — lecture ouverte à tout authentifié (ProjetPermission) : un rôle < Bureau Admin ne
 * reçoit de toute façon jamais les projets "en_preparation" (voir ProjetViewSet.get_queryset
 * côté backend), inutile de le refiltrer ici.
 */
export async function listProjets(filtres: ProjetsFiltres = {}): Promise<CursorPage<Projet>> {
  const { data } = await apiClient.get<CursorPage<Projet>>("/projets/projets/", {
    params: filtres,
  });
  return data;
}

export async function getProjet(id: string): Promise<Projet> {
  const { data } = await apiClient.get<Projet>(`/projets/projets/${id}/`);
  return data;
}

/** Réservé au Bureau Admin+ côté backend (ProjetPermission). */
export async function creerProjet(payload: ProjetPayload): Promise<Projet> {
  const { data } = await apiClient.post<Projet>("/projets/projets/", payload);
  return data;
}

export async function modifierProjet(
  id: string,
  payload: Partial<ProjetPayload>,
): Promise<Projet> {
  const { data } = await apiClient.patch<Projet>(`/projets/projets/${id}/`, payload);
  return data;
}

export async function supprimerProjet(id: string): Promise<void> {
  await apiClient.delete(`/projets/projets/${id}/`);
}

/**
 * Face arrière de la kachel (demande utilisateur point 5) — ouvert à tout authentifié, voir
 * ProjetViewSet.contributeurs côté backend.
 */
export async function getContributeursProjet(id: string): Promise<Contributeur[]> {
  const { data } = await apiClient.get<Contributeur[]>(`/projets/projets/${id}/contributeurs/`);
  return data;
}

/**
 * Kennzahlen "Donators / Gesammelt / Projekte" de la page d'accueil publique (demande
 * utilisateur du 2026-09-26, plan section C.3) — lecture ouverte à tout le monde, y compris non
 * authentifié, voir ProjetViewSet.kennzahlen côté backend.
 */
export async function getKennzahlenProjets(): Promise<ProjetsKennzahlen> {
  const { data } = await apiClient.get<ProjetsKennzahlen>("/projets/projets/kennzahlen/");
  return data;
}

/**
 * Ajoute une image au carrousel de la kachel (demande utilisateur point 1.1) — `multipart/
 * form-data` (axios détecte FormData et fixe lui-même le Content-Type/boundary, même principe
 * que boutiqueApi.televerserImageProduit). Réservé côté backend au Bureau Admin+ OU au
 * responsable DU PROJET ciblé (GestionContenuProjetPermission/est_gestionnaire_projet).
 */
export async function ajouterImageProjet(payload: ProjetImagePayload): Promise<ProjetImage> {
  const formData = new FormData();
  formData.append("projet", payload.projet);
  formData.append("image", payload.image);
  if (payload.ordre !== undefined) {
    formData.append("ordre", String(payload.ordre));
  }
  const { data } = await apiClient.post<ProjetImage>("/projets/images/", formData);
  return data;
}

/** Réordonner une image du carrousel — `projet` n'est volontairement pas accepté ici : il est
 * immuable après création côté serveur (voir ProjetImageSerializer.update). */
export async function modifierImageProjet(
  id: string,
  payload: { ordre: number },
): Promise<ProjetImage> {
  const { data } = await apiClient.patch<ProjetImage>(`/projets/images/${id}/`, payload);
  return data;
}

export async function supprimerImageProjet(id: string): Promise<void> {
  await apiClient.delete(`/projets/images/${id}/`);
}

/** Rapport d'avancement — "Was getan wurde" (demande utilisateur point 7). */
export async function listMisesAJourProjet(projetId: string): Promise<CursorPage<ProjetMiseAJour>> {
  const { data } = await apiClient.get<CursorPage<ProjetMiseAJour>>("/projets/mises-a-jour/", {
    params: { projet: projetId },
  });
  return data;
}

/** Réservé côté backend au Bureau Admin+ OU au responsable DU PROJET ciblé (même règle que
 * ajouterImageProjet). */
export async function creerMiseAJourProjet(
  payload: ProjetMiseAJourPayload,
): Promise<ProjetMiseAJour> {
  const { data } = await apiClient.post<ProjetMiseAJour>("/projets/mises-a-jour/", payload);
  return data;
}

export async function modifierMiseAJourProjet(
  id: string,
  payload: Partial<Pick<ProjetMiseAJourPayload, "titre" | "contenu_html">>,
): Promise<ProjetMiseAJour> {
  const { data } = await apiClient.patch<ProjetMiseAJour>(`/projets/mises-a-jour/${id}/`, payload);
  return data;
}

export async function supprimerMiseAJourProjet(id: string): Promise<void> {
  await apiClient.delete(`/projets/mises-a-jour/${id}/`);
}

/** Image jointe à une mise à jour du rapport (demande utilisateur point 7, "mit Bildern") —
 * même règle d'écriture que ajouterImageProjet, dérivée du projet de la mise à jour. */
export async function ajouterImageMiseAJourProjet(
  payload: ProjetMiseAJourImagePayload,
): Promise<ProjetMiseAJourImage> {
  const formData = new FormData();
  formData.append("mise_a_jour", payload.mise_a_jour);
  formData.append("image", payload.image);
  if (payload.ordre !== undefined) {
    formData.append("ordre", String(payload.ordre));
  }
  const { data } = await apiClient.post<ProjetMiseAJourImage>(
    "/projets/mises-a-jour-images/",
    formData,
  );
  return data;
}

export async function supprimerImageMiseAJourProjet(id: string): Promise<void> {
  await apiClient.delete(`/projets/mises-a-jour-images/${id}/`);
}
