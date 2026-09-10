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
