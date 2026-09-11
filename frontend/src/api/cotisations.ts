/**
 * Client API — module cotisations (TDD §2.4, backend/apps/cotisations/views.py).
 */
import { apiClient } from "./client";
import type { Cotisation, CotisationCreatePayload, ModePaiement } from "../types/cotisation";
import type { CursorPage } from "../types/membre";

/**
 * Historique des paiements (mockup #pg-cotisation, tableau "Historique des
 * paiements") — le backend scope déjà le queryset selon le rôle
 * (CotisationViewSet.get_queryset) : un rôle < RH ne voit ici que ses
 * propres écritures.
 */
export async function listMesCotisations(): Promise<CursorPage<Cotisation>> {
  // Pas de paramètre de tri à transmettre : CotisationCursorPagination
  // impose déjà l'ordre (-created_at, id) côté serveur.
  const { data } = await apiClient.get<CursorPage<Cotisation>>("/cotisations/");
  return data;
}

export async function creerCotisation(payload: CotisationCreatePayload): Promise<Cotisation> {
  const { data } = await apiClient.post<Cotisation>("/cotisations/", payload);
  return data;
}

/**
 * GET /cotisations/{id}/receipt/ (AHM-17) — reçu PDF. 400 côté backend si la cotisation n'est
 * pas payée ; le bouton associé (CotisationStepperPage) n'est de toute façon affiché que pour
 * les lignes statut=payee, voir onSuccess du stepper et le rendu de l'historique.
 */
export async function telechargerRecuCotisation(cotisationId: string): Promise<Blob> {
  const { data } = await apiClient.get(`/cotisations/${cotisationId}/receipt/`, {
    responseType: "blob",
  });
  return data;
}

/**
 * File des paiements à confirmer manuellement (AHM-53) — cotisations restées "en_attente"
 * (ex. virement SEPA en cours de réconciliation). Même schéma que
 * adhesionsApi.listSouscriptionsEnAttenteJustificatif : un seul filtre statut, première page du
 * cursor seulement (petite association, pas encore de navigation de page sur cette file).
 * "echouee" (paiement carte/PayPal refusé côté simulateur) reste consultable via l'historique du
 * membre ou l'admin Django — hors scope de cette file de travail pour ce MVP.
 */
export async function listCotisationsEnAttenteDePaiement(): Promise<CursorPage<Cotisation>> {
  const { data } = await apiClient.get<CursorPage<Cotisation>>("/cotisations/", {
    params: { statut: "en_attente" },
  });
  return data;
}

/**
 * POST /cotisations/{id}/marquer-payee/ (AHM-53) — confirme manuellement un paiement reçu hors
 * ligne. Réservé au Directeur Financier/Admin côté backend (CotisationViewSet.marquer_payee) ;
 * `mode_paiement` n'est requis que si la cotisation n'en a pas déjà un.
 */
export async function marquerCotisationPayee(
  cotisationId: string,
  payload: { mode_paiement?: ModePaiement },
): Promise<Cotisation> {
  const { data } = await apiClient.post<Cotisation>(
    `/cotisations/${cotisationId}/marquer-payee/`,
    payload,
  );
  return data;
}
