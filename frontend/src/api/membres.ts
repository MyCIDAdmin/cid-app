/**
 * Client API — module membres (TDD §2.4, backend/apps/membres/views.py).
 */
import { apiClient } from "./client";
import type {
  ChampExport,
  CursorPage,
  Membre,
  MembreFormValues,
  MembreListItem,
  ResultatImportHistorique,
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

/** POST /membres/import-historique/ (ajouté le 2026-09-19, réservé RH+) — importe l'historique
 * de statut associatif par année (une colonne par année) pour des membres déjà existants,
 * identifiés par email + cin — voir apps.membres.imports_historique côté backend. */
export async function importerHistoriqueStatuts(fichier: File): Promise<ResultatImportHistorique> {
  const formData = new FormData();
  formData.append("fichier", fichier);
  const { data } = await apiClient.post<ResultatImportHistorique>(
    "/membres/import-historique/",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

/** GET /membres/import-historique/template/ — classeur vierge (email/cin + colonnes d'exemple
 * par année) à compléter avant import. */
export async function telechargerTemplateImportHistorique(): Promise<Blob> {
  const { data } = await apiClient.get("/membres/import-historique/template/", {
    responseType: "blob",
  });
  return data;
}

/** Champs de tri acceptés par GET /membres/export/ — voir apps.membres.exports.ORDERING_FIELDS
 * côté backend (liste blanche, un champ inconnu retombe silencieusement sur le tri par défaut
 * nom/prénom plutôt que de faire échouer l'export). */
export type MembresOrdering =
  | "nom"
  | "-nom"
  | "date_adhesion"
  | "-date_adhesion"
  | "statut"
  | "ville_de";

export interface MembresExportParams extends MembresListFilters {
  ordering?: MembresOrdering;
  /** Sous-ensemble de colonnes à exporter (voir apps.membres.exports.CHAMPS_EXPORT côté
   * backend) — toutes les colonnes si omis/vide. */
  champs?: ChampExport[];
}

/** Nom de fichier suggéré par le serveur (Content-Disposition), avec repli si l'en-tête est
 * absent ou dans un format inattendu — ne devrait pas arriver en pratique (toujours envoyé par
 * MembreExportView côté backend), mais un téléchargement ne doit jamais échouer pour un simple
 * souci de nommage. */
function nomFichierDepuisContentDisposition(contentDisposition: unknown): string {
  const valeur = typeof contentDisposition === "string" ? contentDisposition : "";
  const correspondance = /filename="?([^"]+)"?/.exec(valeur);
  return correspondance?.[1] ?? "export_membres.xlsx";
}

/** GET /membres/export/ — export Excel de la liste des membres, filtrée (mêmes paramètres que
 * GET /membres/) et triée (réservé RH+). */
export async function exporterMembres(
  params: MembresExportParams = {},
): Promise<{ blob: Blob; nomFichier: string }> {
  const { champs, ...reste } = params;
  const filtres: Record<string, string> = Object.fromEntries(
    Object.entries(reste).filter(([, value]) => value !== undefined && value !== ""),
  );
  // Liste de clés séparées par virgules, même convention que `ordering` — voir
  // apps.membres.exports.parse_champs côté backend.
  if (champs && champs.length > 0) {
    filtres.champs = champs.join(",");
  }
  const { data, headers } = await apiClient.get("/membres/export/", {
    params: filtres,
    responseType: "blob",
  });
  return { blob: data, nomFichier: nomFichierDepuisContentDisposition(headers["content-disposition"]) };
}
