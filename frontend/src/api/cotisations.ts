/**
 * Client API — module cotisations (TDD §2.4, backend/apps/cotisations/views.py).
 */
import { apiClient } from "./client";
import type { Cotisation, CotisationCreatePayload } from "../types/cotisation";
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
