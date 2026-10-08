/**
 * Client API — module membres (TDD §2.4, backend/apps/membres/views.py).
 */
import { apiClient } from "./client";
import type {
  ChampExport,
  CursorPage,
  HistoriqueStatutEntry,
  ImportArt,
  ImportErgebnis,
  ImportPruefung,
  Membre,
  MembreFormValues,
  MembreListItem,
  RapprochementListe,
  StatutMembre,
} from "../types/membre";

export interface MembresListFilters {
  statut?: StatutMembre | "";
  ville?: string;
  /** Bundesland — voir apps.membres.filters.MembreFilter (ChoiceFilter sur land_de). */
  land?: string;
  /** Pays de résidence — voir apps.membres.filters.MembreFilter. */
  pays?: string;
  nom?: string;
  q?: string;
  /** Bornes (incluses) de la date d'adhésion, format YYYY-MM-DD — voir
   * apps.membres.filters.MembreFilter (date_adhesion_apres/avant, ajoutées à l'UI le
   * 2026-09-19, demande utilisateur : "füge mehr Filtermöglichten hinzu z.B. Bundesland"). */
  date_adhesion_apres?: string;
  date_adhesion_avant?: string;
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

/** GET /membres/moi/ — fiche du compte connecté (bouton "Mein Profil" du menu utilisateur,
 * ajouté le 2026-09-28) : évite de devoir d'abord connaître son propre id. 404 si aucune fiche
 * Membre n'est liée à ce compte (superuser, RH créé hors auto-inscription) — voir
 * MembreViewSet.moi côté backend. */
export async function getMembreMoi(): Promise<Membre> {
  const { data } = await apiClient.get<Membre>("/membres/moi/");
  return data;
}

/** PATCH /membres/moi/ — modifie sa propre fiche sans connaître son id (voir getMembreMoi). */
export async function updateMembreMoi(values: Partial<MembreFormValues>): Promise<Membre> {
  const { data } = await apiClient.patch<Membre>("/membres/moi/", values);
  return data;
}

/** Téléverse la photo de profil du compte connecté (retour utilisateur du 2026-09-28, "zu dem
 * Profile darf der User sein Bild hochladen") — même convention que televerserImageEvenement
 * (FormData + PATCH, requête multipart distincte de l'appel JSON ci-dessus). */
export async function televerserPhotoMembreMoi(fichier: File): Promise<Membre> {
  const formData = new FormData();
  formData.append("photo", fichier);
  const { data } = await apiClient.patch<Membre>("/membres/moi/", formData);
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

const IMPORT_BASIS: Record<ImportArt, string> = {
  membres: "/membres/import",
  historique: "/membres/import-historique",
};

/** POST /membres/import[-historique]/pruefen/ (RH+) — Prüfphase : analysiert die Datei, schreibt
 * nichts. Champ multipart `fichier`. */
export async function pruefenImport(art: ImportArt, fichier: File): Promise<ImportPruefung> {
  const formData = new FormData();
  formData.append("fichier", fichier);
  const { data } = await apiClient.post<ImportPruefung>(`${IMPORT_BASIS[art]}/pruefen/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** POST /membres/import[-historique]/bestaetigen/ (RH+) — dieselbe Datei erneut + Zeilennummern
 * der zu überschreibenden Dubletten ; importiert und liefert den Bericht (Excel, base64). */
export async function bestaetigenImport(
  art: ImportArt,
  fichier: File,
  ueberschreiben: number[],
): Promise<ImportErgebnis> {
  const formData = new FormData();
  formData.append("fichier", fichier);
  ueberschreiben.forEach((ligne) => formData.append("ueberschreiben", String(ligne)));
  const { data } = await apiClient.post<ImportErgebnis>(
    `${IMPORT_BASIS[art]}/bestaetigen/`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

/** GET /membres/import/template/ — classeur vierge à compléter avant import. */
export async function telechargerTemplateImportMembres(): Promise<Blob> {
  const { data } = await apiClient.get("/membres/import/template/", { responseType: "blob" });
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

/** GET /membres/mon-historique/ — historique de statut associatif (une ligne par année) du
 * membre lié au compte connecté, le plus récent en premier. Liste vide (jamais d'erreur) si
 * aucune fiche Membre n'est associée — voir MonHistoriqueStatutView côté backend. */
export async function getMonHistoriqueStatut(): Promise<HistoriqueStatutEntry[]> {
  const { data } = await apiClient.get<HistoriqueStatutEntry[]>("/membres/mon-historique/");
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

/** GET /membres/rapprochement/ (RH+) — Konten mit Vorschlägen importierter Karten (+ Score). */
export async function getRapprochement(): Promise<RapprochementListe> {
  const { data } = await apiClient.get<RapprochementListe>("/membres/rapprochement/");
  return data;
}

/** POST /membres/rapprochement/fusionner/ — verknüpft das Konto mit der importierten Karte. */
export async function fusionnerRapprochement(inscritId: string, importeId: string): Promise<void> {
  await apiClient.post("/membres/rapprochement/fusionner/", {
    inscrit_id: inscritId,
    importe_id: importeId,
  });
}

/** POST /membres/rapprochement/ecarter/ — "Kein Treffer" (Konto verschwindet aus der Liste). */
export async function ecarterRapprochement(inscritId: string): Promise<void> {
  await apiClient.post("/membres/rapprochement/ecarter/", { inscrit_id: inscritId });
}
