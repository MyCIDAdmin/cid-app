/**
 * Client API — module adhesions (TDD §2.4, backend/apps/adhesions/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  CampagneAdhesion,
  CampagneCreatePayload,
  JustificatifRabais,
  OffreAdhesion,
  OffreCreatePayload,
  RabaisCreatePayload,
  RabaisOffre,
  Souscription,
  SouscrireEspecesPayload,
  SouscrirePayload,
  ValiderJustificatifPayload,
} from "../types/adhesion";

/** Campagne publiée en cours (mockup #pg-mon-adhesion) — 404 si aucune. */
export async function getCampagneActive(): Promise<CampagneAdhesion> {
  const { data } = await apiClient.get<CampagneAdhesion>("/adhesions/campagnes/active/");
  return data;
}

/**
 * Catalogue des campagnes — lecture ouverte à tout authentifié
 * (CataloguePermission) : utilisé à la fois par la page admin (liste
 * complète, tous statuts) et par la page membre (résoudre les noms de
 * campagne/offre de son historique, cf. MonAdhesionPage).
 */
export async function listCampagnes(): Promise<CursorPage<CampagneAdhesion>> {
  const { data } = await apiClient.get<CursorPage<CampagneAdhesion>>("/adhesions/campagnes/");
  return data;
}

export async function creerCampagne(payload: CampagneCreatePayload): Promise<CampagneAdhesion> {
  const { data } = await apiClient.post<CampagneAdhesion>("/adhesions/campagnes/", payload);
  return data;
}

export async function publierCampagne(id: string): Promise<CampagneAdhesion> {
  const { data } = await apiClient.post<CampagneAdhesion>(`/adhesions/campagnes/${id}/publier/`);
  return data;
}

export async function cloturerCampagne(id: string): Promise<CampagneAdhesion> {
  const { data } = await apiClient.post<CampagneAdhesion>(`/adhesions/campagnes/${id}/cloturer/`);
  return data;
}

/**
 * Gestion des offres/rabais d'une campagne — demande utilisateur du 2026-09-16 ("tool" frontend
 * analogue au Django Admin, périmètre étendu par rapport à la version initiale d'AdminCampagnesPage
 * qui renvoyait à Django Admin pour ceci). Le backend expose déjà ce CRUD complet depuis AHM-19
 * (OffreAdhesionViewSet/RabaisOffreViewSet) : seule l'UI manquait.
 */
export async function creerOffre(payload: OffreCreatePayload): Promise<OffreAdhesion> {
  const { data } = await apiClient.post<OffreAdhesion>("/adhesions/offres/", payload);
  return data;
}

export async function modifierOffre(
  id: string,
  payload: Partial<OffreCreatePayload>,
): Promise<OffreAdhesion> {
  const { data } = await apiClient.patch<OffreAdhesion>(`/adhesions/offres/${id}/`, payload);
  return data;
}

export async function supprimerOffre(id: string): Promise<void> {
  await apiClient.delete(`/adhesions/offres/${id}/`);
}

export async function creerRabais(payload: RabaisCreatePayload): Promise<RabaisOffre> {
  const { data } = await apiClient.post<RabaisOffre>("/adhesions/rabais/", payload);
  return data;
}

export async function modifierRabais(
  id: string,
  payload: Partial<RabaisCreatePayload>,
): Promise<RabaisOffre> {
  const { data } = await apiClient.patch<RabaisOffre>(`/adhesions/rabais/${id}/`, payload);
  return data;
}

export async function supprimerRabais(id: string): Promise<void> {
  await apiClient.delete(`/adhesions/rabais/${id}/`);
}

/**
 * Stornieren/zurückziehen (demande utilisateur du 2026-09-16) — POST
 * /adhesions/souscriptions/{id}/annuler/ : le membre propriétaire (souscription non payée) ou
 * RH+/Bureau Admin (voir SouscriptionViewSet.annuler côté backend, qui recalcule lui-même les
 * statuts autorisés — jamais fait confiance au frontend, CLAUDE.md §8).
 */
export async function annulerSouscription(id: string): Promise<Souscription> {
  const { data } = await apiClient.post<Souscription>(`/adhesions/souscriptions/${id}/annuler/`);
  return data;
}

export async function souscrire(payload: SouscrirePayload): Promise<Souscription> {
  const { data } = await apiClient.post<Souscription>(
    "/adhesions/souscriptions/souscrire/",
    payload,
  );
  return data;
}

/**
 * Souscription + paiement immédiat en espèces pour le compte d'un autre membre (ajouté le
 * 2026-09-21, F-015) — voir SouscriptionViewSet.souscrire_especes côté backend.
 */
export async function souscrireEspeces(payload: SouscrireEspecesPayload): Promise<Souscription> {
  const { data } = await apiClient.post<Souscription>(
    "/adhesions/souscriptions/souscrire-especes/",
    payload,
  );
  return data;
}

export async function listMesSouscriptions(): Promise<CursorPage<Souscription>> {
  const { data } = await apiClient.get<CursorPage<Souscription>>(
    "/adhesions/souscriptions/mes-souscriptions/",
  );
  return data;
}

/**
 * POST /adhesions/justificatifs/ (multipart, AHM-20) — upload initial ou remplacement (le
 * backend remplace le fichier sur le même enregistrement tant que le justificatif existant
 * est encore "en_attente" — voir JustificatifRabaisViewSet.create côté API). Réutilisée telle
 * quelle par AdminJustificatifsPage pour l'upload RH+ "pour le compte d'un membre" (demande
 * utilisateur du 2026-09-16) : aucune vérification de propriétaire côté frontend, c'est le
 * backend qui autorise ou non selon le rôle de l'appelant.
 */
export async function uploaderJustificatif(
  souscriptionId: string,
  fichier: File,
): Promise<JustificatifRabais> {
  const formData = new FormData();
  formData.append("souscription", souscriptionId);
  formData.append("fichier", fichier);
  const { data } = await apiClient.post<JustificatifRabais>("/adhesions/justificatifs/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * File de validation RH+ (AHM-20, RICEFW R-ADH-05) — réutilise GET /adhesions/souscriptions/
 * (déjà scopé RH+ voit tout par SouscriptionPermission) plutôt que GET /adhesions/justificatifs/
 * : la souscription nichée porte membre/offre/rabais/campagne, nécessaires pour un affichage
 * utile de la file — JustificatifRabaisSerializer seul (id/statut/dates) ne suffirait pas.
 * Inclut aussi les souscriptions dont le justificatif n'a pas encore été uploadé (justificatif
 * null) : file d'attente au sens large, pas uniquement les fichiers déjà soumis.
 */
export async function listSouscriptionsEnAttenteJustificatif(): Promise<CursorPage<Souscription>> {
  const { data } = await apiClient.get<CursorPage<Souscription>>("/adhesions/souscriptions/", {
    params: { statut: "en_attente_justificatif" },
  });
  return data;
}

/** GET /adhesions/justificatifs/{id}/telecharger/ — URL MinIO pré-signée, TTL 15 min. */
export async function telechargerJustificatif(
  id: string,
): Promise<{ url: string; expires_in: number }> {
  const { data } = await apiClient.get<{ url: string; expires_in: number }>(
    `/adhesions/justificatifs/${id}/telecharger/`,
  );
  return data;
}

/** POST /adhesions/justificatifs/{id}/valider/ — RH+, motif obligatoire en cas de rejet. */
export async function validerJustificatif(
  id: string,
  payload: ValiderJustificatifPayload,
): Promise<JustificatifRabais> {
  const { data } = await apiClient.post<JustificatifRabais>(
    `/adhesions/justificatifs/${id}/valider/`,
    payload,
  );
  return data;
}
