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
 * COURANT aux 13 pages de gestion (`apps.rbac.registry.PAGES_ADMIN`), UN NIVEAU par slug.
 * `IsAuthenticated` seul côté backend (pas `IsSuperAdmin`) — chaque utilisateur consulte cette
 * route pour construire sa propre navigation (voir RequireRole en mode `pageSlug` et
 * Sidebar.tsx). Les clés ne sont pas figées en TS (comme `ModuleInfo`) : un nouveau slug ajouté
 * côté registry apparaît automatiquement, sans changement frontend requis.
 *
 * Format changé le 2026-09-24 (task #215, retour utilisateur — un booléen ne suffisait plus à
 * savoir si les contrôles d'ÉCRITURE d'une page devaient être désactivés, depuis que `lecture`
 * et `lecture_ecriture` ont un effet réellement différent côté backend, voir
 * apps.rbac.services.has_admin_page_access) : auparavant `Record<string, boolean>`, désormais
 * le niveau réel. Ne jamais comparer une valeur de cette réponse à `true`/`=== true` — utiliser
 * `pageEstAccessible`/`pageEstModifiable` ci-dessous, qui sont la source unique de vérité pour
 * interpréter ce niveau côté frontend.
 */
export type MesAccesReponse = Record<string, NiveauAcces>;

/**
 * "A accès à la page" au sens large (routing/Sidebar) — `lecture` ET `lecture_ecriture`
 * suffisent tous les deux, un slug absent de la réponse ou `undefined` (chargement en cours)
 * compte comme non accessible. Symétrique du défaut `required=NiveauAcces.LECTURE` côté
 * `has_admin_page_access` (backend).
 */
export function pageEstAccessible(niveau: NiveauAcces | undefined): boolean {
  return niveau !== undefined && niveau !== "aucun";
}

/**
 * "Peut modifier" au sein d'une des 13 pages de gestion — SEUL `lecture_ecriture` suffit,
 * contrairement à `pageEstAccessible` ci-dessus. C'est la question que les 13 pages posent pour
 * savoir si leurs contrôles d'écriture (créer/modifier/supprimer...) doivent être désactivés en
 * mode lecture seule (task #216). Symétrique de `required=NiveauAcces.LECTURE_ECRITURE` côté
 * backend.
 */
export function pageEstModifiable(niveau: NiveauAcces | undefined): boolean {
  return niveau === "lecture_ecriture";
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

/**
 * GET /rbac/visibilite-membre/effective/ — un booléen par slug de `registry.MODULES` (10 modules
 * métier, PAS les 13 `PAGES_ADMIN` de `MesAccesReponse` ci-dessus : deux mécanismes distincts,
 * voir docstring backend `ModuleVisibiliteMembre`). Un slug absent équivaut à visible (même
 * défaut que le backend, `existantes.get(m, True)`) — voir Sidebar.tsx::useSidebarNav pour la
 * consommation (uniquement appliqué au rôle système "Membre Normal", jamais aux rôles supérieurs,
 * voir docstring du modèle backend).
 */
export type VisibiliteEffectiveReponse = Record<string, boolean>;
