/**
 * Client API — module evenements (TDD §2.4, backend/apps/evenements/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  Covoiturage,
  CovoituragePayload,
  Evenement,
  EvenementPayload,
  Inscription,
  InscrireEspecesPayload,
  InscrirePayload,
  RejoindreTrajetPayload,
  ReservationCovoiturage,
  StatutEvenement,
  StatutInscription,
  TypeEvenement,
} from "../types/evenements";

export interface EvenementsFiltres {
  statut?: StatutEvenement;
  type_evenement?: TypeEvenement;
  date_apres?: string;
  date_avant?: string;
  cursor?: string;
}

/**
 * Catalogue — lecture ouverte à tout authentifié (EvenementPermission) : un rôle < Bureau
 * Admin ne reçoit de toute façon que les événements publiés (voir
 * EvenementViewSet.get_queryset côté backend), inutile de le refiltrer ici.
 */
export async function listEvenements(
  filtres: EvenementsFiltres = {},
): Promise<CursorPage<Evenement>> {
  const { data } = await apiClient.get<CursorPage<Evenement>>("/evenements/evenements/", {
    params: filtres,
  });
  return data;
}

export async function creerEvenement(payload: EvenementPayload): Promise<Evenement> {
  const { data } = await apiClient.post<Evenement>("/evenements/evenements/", payload);
  return data;
}

export async function modifierEvenement(
  id: string,
  payload: Partial<EvenementPayload>,
): Promise<Evenement> {
  const { data } = await apiClient.patch<Evenement>(`/evenements/evenements/${id}/`, payload);
  return data;
}

export async function publierEvenement(id: string): Promise<Evenement> {
  const { data } = await apiClient.post<Evenement>(`/evenements/evenements/${id}/publier/`);
  return data;
}

export async function annulerEvenement(id: string): Promise<Evenement> {
  const { data } = await apiClient.post<Evenement>(`/evenements/evenements/${id}/annuler/`);
  return data;
}

/**
 * Téléverse l'image de la kachel d'un événement (demande utilisateur du 2026-09-27, point
 * 11.1) — FormData + PATCH, même convention que televerserImageProduit (api/boutique.ts) :
 * requête multipart distincte de l'appel JSON de création/modification.
 */
export async function televerserImageEvenement(id: string, fichier: File): Promise<Evenement> {
  const formData = new FormData();
  formData.append("image", fichier);
  const { data } = await apiClient.patch<Evenement>(`/evenements/evenements/${id}/`, formData);
  return data;
}

/**
 * S'inscrire à un événement — le montant/la capacité sont toujours recalculés côté serveur
 * (CLAUDE.md §8, verrouillage SELECT FOR UPDATE), voir InscrirePayload/EvenementViewSet.inscrire.
 * Ré-appeler avec le même événement met à jour l'inscription existante (une seule ligne par
 * membre/événement côté backend) plutôt que d'en créer une seconde.
 */
export async function inscrire(payload: InscrirePayload): Promise<Inscription> {
  const { data } = await apiClient.post<Inscription>("/evenements/evenements/inscrire/", payload);
  return data;
}

/**
 * Inscrit un AUTRE membre à un événement payant avec paiement cash immédiat (retour
 * utilisateur du 2026-09-21 : "Event als Artikeltyp hinzufügen" dans le formulaire "Barzahlung
 * eintragen" de CotisationsEnAttentePage) — réservé côté backend au Directeur Financier/Admin
 * (voir InscrireEspecesPayload/EvenementViewSet.inscrire_especes).
 */
export async function inscrireEspeces(payload: InscrireEspecesPayload): Promise<Inscription> {
  const { data } = await apiClient.post<Inscription>(
    "/evenements/evenements/inscrire-especes/",
    payload,
  );
  return data;
}

export interface InscriptionsFiltres {
  evenement?: string;
  statut?: StatutInscription;
  cursor?: string;
}

/**
 * Bureau Admin+ voit toutes les inscriptions ; en dessous, uniquement les siennes — IDOR géré
 * côté backend (InscriptionViewSet.get_queryset, SCD §2.3 A01). Sert donc aussi bien à "Mes
 * inscriptions" (membre) qu'à une vue de gestion, selon le rôle courant.
 */
export async function listInscriptions(
  filtres: InscriptionsFiltres = {},
): Promise<CursorPage<Inscription>> {
  const { data } = await apiClient.get<CursorPage<Inscription>>("/evenements/inscriptions/", {
    params: filtres,
  });
  return data;
}

export async function annulerInscription(id: string): Promise<Inscription> {
  const { data } = await apiClient.post<Inscription>(`/evenements/inscriptions/${id}/annuler/`);
  return data;
}

export interface CovoituragesFiltres {
  evenement?: string;
  date_apres?: string;
  cursor?: string;
}

/** Lecture ouverte à tout authentifié — liste communautaire des trajets (mockup
 * #pg-covoiturage). */
export async function listCovoiturages(
  filtres: CovoituragesFiltres = {},
): Promise<CursorPage<Covoiturage>> {
  const { data } = await apiClient.get<CursorPage<Covoiturage>>("/evenements/covoiturages/", {
    params: filtres,
  });
  return data;
}

export async function creerCovoiturage(payload: CovoituragePayload): Promise<Covoiturage> {
  const { data } = await apiClient.post<Covoiturage>("/evenements/covoiturages/", payload);
  return data;
}

export async function modifierCovoiturage(
  id: string,
  payload: Partial<CovoituragePayload>,
): Promise<Covoiturage> {
  const { data } = await apiClient.patch<Covoiturage>(`/evenements/covoiturages/${id}/`, payload);
  return data;
}

export async function supprimerCovoiturage(id: string): Promise<void> {
  await apiClient.delete(`/evenements/covoiturages/${id}/`);
}

/** Rejoindre un trajet — capacité vérifiée atomiquement côté serveur, voir
 * RejoindreTrajetPayload/CovoiturageViewSet.rejoindre. */
export async function rejoindreTrajet(
  id: string,
  payload: RejoindreTrajetPayload,
): Promise<ReservationCovoiturage> {
  const { data } = await apiClient.post<ReservationCovoiturage>(
    `/evenements/covoiturages/${id}/rejoindre/`,
    payload,
  );
  return data;
}

export interface ReservationsCovoiturageFiltres {
  trajet?: string;
  cursor?: string;
}

export async function listReservationsCovoiturage(
  filtres: ReservationsCovoiturageFiltres = {},
): Promise<CursorPage<ReservationCovoiturage>> {
  const { data } = await apiClient.get<CursorPage<ReservationCovoiturage>>(
    "/evenements/reservations-covoiturage/",
    { params: filtres },
  );
  return data;
}
