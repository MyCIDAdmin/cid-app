/**
 * Types — app rbac (Modul Rollenverwaltung, Phase C, 2026-09-23) :
 * matrice Rôle × Module et attribution multi-rôle, backend/apps/rbac/.
 * Voir backend/apps/rbac/serializers.py pour la forme exacte de chaque
 * payload/réponse — reflétée ici un à un.
 */

export type NiveauAcces = "aucun" | "lecture" | "lecture_ecriture";

export interface RoleDefinition {
  id: string;
  slug: string;
  nom: string;
  description: string;
  /** Un des 5 rôles historiques (accounts.Role) — non éditable/supprimable via l'API. */
  is_system: boolean;
  ordre: number;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

/** POST /rbac/roles/ — `slug` uniquement à la création (RoleDefinitionSerializer). */
export interface CreerRolePayload {
  slug: string;
  nom: string;
  description?: string;
  ordre?: number;
  actif?: boolean;
}

/** PATCH /rbac/roles/{id}/ — `slug`/`is_system` en lecture seule côté backend. */
export type ModifierRolePayload = Partial<Omit<CreerRolePayload, "slug">>;

export interface ModuleInfo {
  slug: string;
  label: string;
}

export interface MatriceCell {
  role_id: string;
  module: string;
  niveau_acces: NiveauAcces;
}

/** GET /rbac/matrix/ — source unique de vérité pour "la liste complète des rôles" côté
 * frontend (non paginée, contrairement à GET /rbac/roles/) — voir hooks/useRbac.ts. */
export interface MatriceReponse {
  roles: RoleDefinition[];
  modules: ModuleInfo[];
  cells: MatriceCell[];
}

/** POST /rbac/matrix/set/ */
export interface SetMatriceCellulePayload {
  role_id: string;
  module: string;
  niveau_acces: NiveauAcces;
}

/** GET/POST /rbac/utilisateurs/{id}/roles/ */
export interface UtilisateurRolesReponse {
  user_id: string;
  role_ids: string[];
  role_primaire: string;
}
