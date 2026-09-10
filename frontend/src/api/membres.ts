/**
 * Client API — module membres (TDD §2.4, backend/apps/membres/views.py).
 */
import { apiClient } from "./client";
import type {
  CursorPage,
  Membre,
  MembreFormValues,
  MembreListItem,
  ResultatImportMembres,
  StatutMembre,
} from "../types/membre";

export interface MembresListFilters {
  statut?: StatutMembre | "";
  ville?: string;
  land?: string;
  nom?: string;
  q?: string;
}

export async function listMembres(
  filters: MembresListFilters = {},
): Promise<CursorPage<MembreListItem>> {
  // On ne transmet pas les filtres vides — évite `?ville=&statut=` inutiles.
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""),
  );
  const { data } = await apiClient.get<CursorPage<MembreListItem>>("/membres/", { params });
  return data;
}

/**
 * Suit un lien `next`/`previous` renvoyé par CursorPagination (URL absolue
 * incluant déjà le paramètre `cursor`) — plus simple et plus sûr que
 * d'extraire nous-mêmes le curseur de l'URL.
 */
export async function getMembresPage(url: string): Promise<CursorPage<MembreListItem>> {
  const { data } = await apiClient.get<CursorPage<MembreListItem>>(url);
  return data;
}

export async function getMembre(id: string): Promise<Membre> {
  const { data } = await apiClient.get<Membre>(`/membres/${id}/`);
  return data;
}

export async function createMembre(values: MembreFormValues): Promise<Membre> {
  const { data } = await apiClient.post<Membre>("/membres/", values);
  return data;
}

export async function updateMembre(
  id: string,
  values: Partial<MembreFormValues>,
): Promise<Membre> {
  const { data } = await apiClient.patch<Membre>(`/membres/${id}/`, values);
  return data;
}

export async function deleteMembre(id: string): Promise<void> {
  await apiClient.delete(`/membres/${id}/`);
}

export async function changerStatutMembre(id: string, statut: StatutMembre): Promise<Membre> {
  const { data } = await apiClient.post<Membre>(`/membres/${id}/changer_statut/`, { statut });
  return data;
}

/** POST /membres/import/ (RICEFW W-008/F-019, réservé RH+) — champ multipart `fichier`. */
export async function importerMembres(fichier: File): Promise<ResultatImportMembres> {
  const formData = new FormData();
  formData.append("fichier", fichier);
  const { data } = await apiClient.post<ResultatImportMembres>("/membres/import/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** GET /membres/import/template/ — classeur vierge à compléter avant import. */
export async function telechargerTemplateImportMembres(): Promise<Blob> {
  const { data } = await apiClient.get("/membres/import/template/", { responseType: "blob" });
  return data;
}
