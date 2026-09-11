/**
 * Client API — module adhesions (TDD §2.4, backend/apps/adhesions/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  CampagneAdhesion,
  CampagneCreatePayload,
  Souscription,
  SouscrirePayload,
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

export async function souscrire(payload: SouscrirePayload): Promise<Souscription> {
  const { data } = await apiClient.post<Souscription>(
    "/adhesions/souscriptions/souscrire/",
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
