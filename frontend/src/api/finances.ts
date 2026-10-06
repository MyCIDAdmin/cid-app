/** Client API — module finances (backend/apps/finances). Réservé à la page `page_finances`. */
import { apiClient } from "./client";
import type {
  BudgetLigne,
  CategorieDepense,
  Depense,
  DepensePayload,
  DepensesFiltres,
} from "../types/finances";

export async function listCategories(): Promise<CategorieDepense[]> {
  const { data } = await apiClient.get<CategorieDepense[]>("/finances/categories/");
  return data;
}

export async function creerCategorie(nom: string): Promise<CategorieDepense> {
  const { data } = await apiClient.post<CategorieDepense>("/finances/categories/", { nom });
  return data;
}

export async function modifierCategorie(
  id: string,
  patch: Partial<Pick<CategorieDepense, "nom" | "actif" | "ordre">>,
): Promise<CategorieDepense> {
  const { data } = await apiClient.patch<CategorieDepense>(`/finances/categories/${id}/`, patch);
  return data;
}

export async function listDepenses(filtres: DepensesFiltres = {}): Promise<Depense[]> {
  const { data } = await apiClient.get<Depense[]>("/finances/depenses/", { params: filtres });
  return data;
}

/** multipart/form-data : axios fixe lui-même le Content-Type/boundary pour un FormData. */
function versFormData(payload: Partial<DepensePayload>): FormData {
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

export async function creerDepense(payload: DepensePayload): Promise<Depense> {
  const { data } = await apiClient.post<Depense>("/finances/depenses/", versFormData(payload));
  return data;
}

export async function modifierDepense(
  id: string,
  payload: Partial<DepensePayload>,
): Promise<Depense> {
  const { data } = await apiClient.patch<Depense>(
    `/finances/depenses/${id}/`,
    versFormData(payload),
  );
  return data;
}

export async function supprimerDepense(id: string): Promise<void> {
  await apiClient.delete(`/finances/depenses/${id}/`);
}

export async function approuverDepense(id: string): Promise<Depense> {
  const { data } = await apiClient.post<Depense>(`/finances/depenses/${id}/approuver/`);
  return data;
}

export async function rejeterDepense(id: string, motif: string): Promise<Depense> {
  const { data } = await apiClient.post<Depense>(`/finances/depenses/${id}/rejeter/`, { motif });
  return data;
}

export async function getBudget(annee: number): Promise<BudgetLigne[]> {
  const { data } = await apiClient.get<BudgetLigne[]>("/finances/budget/", { params: { annee } });
  return data;
}

export async function definirBudget(
  annee: number,
  lignes: { categorie: string; montant: string }[],
): Promise<BudgetLigne[]> {
  const { data } = await apiClient.post<BudgetLigne[]>("/finances/budget/", { annee, lignes });
  return data;
}
