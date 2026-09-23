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

/** "page_admin" pour une des 13 pages de gestion (Phase D), "donnees" pour un module métier
 * "classique" (Phase A/B) — reflète apps.rbac.registry.categorie_module côté backend. Permet au
 * frontend de verrouiller les cellules Administrateur App sur les pages de gestion sans avoir à
 * recopier la liste PAGES_ADMIN en TypeScript. */
export type CategorieModule = "donnees" | "page_admin";

export interface ModuleInfo {
  slug: string;
  label: string;
  categorie: CategorieModule;
}

/**
 * GET /rbac/mes-acces/ — Phase D (ajoutée le 2026-09-23) : accès effectif de l'utilisateur
 * COURANT aux 13 pages de gestion (`apps.rbac.registry.PAGES_ADMIN`), un booléen par slug.
 * `IsAuthenticated` seul côté backend (pas `IsSuperAdmin`) — chaque utilisateur consulte cette
 * route pour construire sa propre navigation (voir RequireRole en mode `pageSlug` et
 * Sidebar.tsx). Les clés ne sont pas figées en TS (comme `ModuleInfo`) : un nouveau slug ajouté
 * côté registry apparaît automatiquement, sans changement frontend requis.
 */
export type MesAccesReponse = Record<string, boolean>;

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
