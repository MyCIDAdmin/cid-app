/**
 * Client API — module projets ("Projets & Actions", backend/apps/projets/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  Arbeitsbereich,
  Aufgabe,
  AufgabeKommentar,
  AufgabePayload,
  Contributeur,
  KostenPosition,
  KostenPositionPayload,
  KostenUebersicht,
  PlanKostenEintrag,
  ProjetMitglied,
  RolleProjet,
  SichtbarkeitProjet,
  StatutAufgabe,
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

export async function modifierProjet(id: string, payload: Partial<ProjetPayload>): Promise<Projet> {
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

// --- Espace de travail : visibilité, équipe, tâches (2026-10-06) ---------------------------

export async function aendereSichtbarkeit(
  id: string,
  sichtbarkeit: SichtbarkeitProjet,
): Promise<Projet> {
  const { data } = await apiClient.post<Projet>(`/projets/projets/${id}/sichtbarkeit/`, {
    sichtbarkeit,
  });
  return data;
}

export async function getArbeitsbereich(id: string): Promise<Arbeitsbereich> {
  const { data } = await apiClient.get<Arbeitsbereich>(`/projets/projets/${id}/arbeitsbereich/`);
  return data;
}

export async function listTeam(projetId: string): Promise<ProjetMitglied[]> {
  const { data } = await apiClient.get<CursorPage<ProjetMitglied>>("/projets/team/", {
    params: { projet: projetId },
  });
  return data.results;
}

export async function teamHinzufuegen(payload: {
  projet: string;
  membre: string;
  rolle: RolleProjet;
}): Promise<ProjetMitglied> {
  const { data } = await apiClient.post<ProjetMitglied>("/projets/team/", payload);
  return data;
}

export async function teamRolleAendern(id: string, rolle: RolleProjet): Promise<ProjetMitglied> {
  const { data } = await apiClient.patch<ProjetMitglied>(`/projets/team/${id}/`, { rolle });
  return data;
}

export async function teamEntfernen(id: string): Promise<void> {
  await apiClient.delete(`/projets/team/${id}/`);
}

export async function listAufgaben(projetId: string): Promise<Aufgabe[]> {
  const { data } = await apiClient.get<CursorPage<Aufgabe>>("/projets/aufgaben/", {
    params: { projet: projetId },
  });
  return data.results;
}

export async function aufgabeErstellen(payload: AufgabePayload): Promise<Aufgabe> {
  const { data } = await apiClient.post<Aufgabe>("/projets/aufgaben/", payload);
  return data;
}

export async function aufgabeAendern(
  id: string,
  payload: Partial<Omit<AufgabePayload, "projet">>,
): Promise<Aufgabe> {
  const { data } = await apiClient.patch<Aufgabe>(`/projets/aufgaben/${id}/`, payload);
  return data;
}

export async function aufgabeLoeschen(id: string): Promise<void> {
  await apiClient.delete(`/projets/aufgaben/${id}/`);
}

export async function aufgabeVerschieben(
  id: string,
  status: StatutAufgabe,
  position: number,
): Promise<Aufgabe> {
  const { data } = await apiClient.post<Aufgabe>(`/projets/aufgaben/${id}/verschieben/`, {
    status,
    position,
  });
  return data;
}

export async function listKommentare(aufgabeId: string): Promise<AufgabeKommentar[]> {
  const { data } = await apiClient.get<CursorPage<AufgabeKommentar>>(
    "/projets/aufgaben-kommentare/",
    { params: { aufgabe: aufgabeId } },
  );
  return data.results;
}

export async function kommentarErstellen(aufgabe: string, text: string): Promise<AufgabeKommentar> {
  const { data } = await apiClient.post<AufgabeKommentar>("/projets/aufgaben-kommentare/", {
    aufgabe,
    text,
  });
  return data;
}

export async function kommentarLoeschen(id: string): Promise<void> {
  await apiClient.delete(`/projets/aufgaben-kommentare/${id}/`);
}

// --- Coûts du projet : plan / réel (2026-10-06) -------------------------------------------------

export async function getKostenUebersicht(id: string): Promise<KostenUebersicht> {
  const { data } = await apiClient.get<KostenUebersicht>(
    `/projets/projets/${id}/kosten-uebersicht/`,
  );
  return data;
}

export async function listPlankosten(projetId: string): Promise<PlanKostenEintrag[]> {
  const { data } = await apiClient.get<PlanKostenEintrag[]>("/projets/plankosten/", {
    params: { projet: projetId },
  });
  return data;
}

export async function plankostenErstellen(payload: {
  projet: string;
  categorie: string;
  betrag: string;
}): Promise<PlanKostenEintrag> {
  const { data } = await apiClient.post<PlanKostenEintrag>("/projets/plankosten/", payload);
  return data;
}

export async function plankostenAendern(id: string, betrag: string): Promise<PlanKostenEintrag> {
  const { data } = await apiClient.patch<PlanKostenEintrag>(`/projets/plankosten/${id}/`, {
    betrag,
  });
  return data;
}

export async function plankostenLoeschen(id: string): Promise<void> {
  await apiClient.delete(`/projets/plankosten/${id}/`);
}

export async function listKosten(projetId: string): Promise<KostenPosition[]> {
  const { data } = await apiClient.get<KostenPosition[]>("/projets/kosten/", {
    params: { projet: projetId },
  });
  return data;
}

/** multipart/form-data (Beleg PDF/JPG/PNG) — axios fixe lui-même le Content-Type du FormData. */
function kostenFormData(payload: Partial<KostenPositionPayload>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(payload)) {
    if (valeur === undefined) continue;
    if (valeur === null) {
      if (cle !== "justificatif") formData.append(cle, "");
      continue;
    }
    formData.append(cle, valeur instanceof File ? valeur : String(valeur));
  }
  return formData;
}

export async function kostenErfassen(payload: KostenPositionPayload): Promise<KostenPosition> {
  const { data } = await apiClient.post<KostenPosition>(
    "/projets/kosten/",
    kostenFormData(payload),
  );
  return data;
}

export async function kostenAendern(
  id: string,
  payload: Partial<Omit<KostenPositionPayload, "projet">>,
): Promise<KostenPosition> {
  const { data } = await apiClient.patch<KostenPosition>(
    `/projets/kosten/${id}/`,
    kostenFormData(payload),
  );
  return data;
}

export async function kostenLoeschen(id: string): Promise<void> {
  await apiClient.delete(`/projets/kosten/${id}/`);
}
