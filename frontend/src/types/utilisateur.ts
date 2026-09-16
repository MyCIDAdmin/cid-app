/**
 * Types — gestion des rôles utilisateurs (SCD §4.2/§8.1, réservée à
 * l'Admin App), backend/apps/accounts/views.py::UsersListView &
 * ChangeUserRoleView.
 */
import type { CidUser } from "../store/authStore";
import type { CursorPage } from "./membre";

export interface UtilisateurGere {
  id: string;
  email: string;
  role: CidUser["role"];
  is_active: boolean;
  created_at: string;
  /** Vides pour un compte sans fiche Membre liée (superuser…) — voir
   * UserManagementSerializer.get_prenom/get_nom côté backend. */
  prenom: string;
  nom: string;
}

export type UtilisateursPage = CursorPage<UtilisateurGere>;

/** Ordre FDD §2.1 (niveau croissant) — reflète ROLE_LEVELS côté backend. */
export const ROLES: { value: CidUser["role"]; labelKey: string }[] = [
  { value: "membre", labelKey: "role.membre" },
  { value: "rh", labelKey: "role.rh" },
  { value: "bureau_admin", labelKey: "role.bureau_admin" },
  { value: "dir_financier", labelKey: "role.dir_financier" },
  { value: "super_admin", labelKey: "role.super_admin" },
];
