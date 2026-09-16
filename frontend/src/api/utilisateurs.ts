/**
 * Client API — gestion des rôles utilisateurs (SCD §4.2, réservé Admin
 * App), backend/apps/accounts/views.py::UsersListView & ChangeUserRoleView.
 */
import { apiClient } from "./client";
import type { CidUser } from "../store/authStore";
import type { UtilisateurGere, UtilisateursPage } from "../types/utilisateur";

export async function listUtilisateurs(q: string): Promise<UtilisateursPage> {
  const { data } = await apiClient.get<UtilisateursPage>("/auth/users/", {
    params: q ? { q } : {},
  });
  return data;
}

/** Suit un lien next/previous CursorPagination (URL absolue). */
export async function getUtilisateursPage(url: string): Promise<UtilisateursPage> {
  const { data } = await apiClient.get<UtilisateursPage>(url);
  return data;
}

export async function changerRoleUtilisateur(
  id: string,
  role: CidUser["role"],
): Promise<UtilisateurGere> {
  const { data } = await apiClient.post<UtilisateurGere>(`/auth/users/${id}/changer_role/`, {
    role,
  });
  return data;
}
