/**
 * Client API — app rbac (Modul Rollenverwaltung, Phase C), backend/apps/rbac/views.py.
 * Pas de wrapper autour de `GET /rbac/roles/` (paginé, page_size=20) : `getMatrice()`
 * renvoie déjà la liste complète et non paginée des rôles (`matrice.roles`), utilisée
 * partout dans le frontend comme source unique de vérité — voir hooks/useRbac.ts.
 */
import { apiClient } from "./client";
import type {
  CreerRolePayload,
  MatriceReponse,
  MesAccesReponse,
  ModifierRolePayload,
  RoleDefinition,
  SetMatriceCellulePayload,
  UtilisateurRolesReponse,
  SetVisibilitePayload,
  VisibiliteEffectiveReponse,
  VisibiliteModuleLigne,
} from "../types/rbac";

export async function creerRole(payload: CreerRolePayload): Promise<RoleDefinition> {
  const { data } = await apiClient.post<RoleDefinition>("/rbac/roles/", payload);
  return data;
}

export async function modifierRole(
  id: string,
  payload: ModifierRolePayload,
): Promise<RoleDefinition> {
  const { data } = await apiClient.patch<RoleDefinition>(`/rbac/roles/${id}/`, payload);
  return data;
}

export async function supprimerRole(id: string): Promise<void> {
  await apiClient.delete(`/rbac/roles/${id}/`);
}

export async function getMatrice(): Promise<MatriceReponse> {
  const { data } = await apiClient.get<MatriceReponse>("/rbac/matrix/");
  return data;
}

export async function setMatriceCellule(
  payload: SetMatriceCellulePayload,
): Promise<SetMatriceCellulePayload> {
  const { data } = await apiClient.post<SetMatriceCellulePayload>("/rbac/matrix/set/", payload);
  return data;
}

export async function getRolesUtilisateur(userId: string): Promise<UtilisateurRolesReponse> {
  const { data } = await apiClient.get<UtilisateurRolesReponse>(
    `/rbac/utilisateurs/${userId}/roles/`,
  );
  return data;
}

export async function assignerRolesUtilisateur(
  userId: string,
  roleIds: string[],
): Promise<UtilisateurRolesReponse> {
  const { data } = await apiClient.post<UtilisateurRolesReponse>(
    `/rbac/utilisateurs/${userId}/roles/`,
    { role_ids: roleIds },
  );
  return data;
}

/** GET /rbac/mes-acces/ — Phase D, voir types/rbac.ts::MesAccesReponse. */
export async function getMesAcces(): Promise<MesAccesReponse> {
  const { data } = await apiClient.get<MesAccesReponse>("/rbac/mes-acces/");
  return data;
}

/** GET /rbac/visibilite-membre/effective/ — voir types/rbac.ts::VisibiliteEffectiveReponse. Bug
 * corrigé le 2026-09-28 (retour utilisateur : un module masqué dans "ModuleVisibiliteMembre"
 * restait toujours affiché à un membre normal) — cet endpoint existait déjà côté backend mais
 * n'était appelé par aucun client frontend, voir hooks/useRbac.ts::useVisibiliteEffective. */
export async function getVisibiliteEffective(): Promise<VisibiliteEffectiveReponse> {
  const { data } = await apiClient.get<VisibiliteEffectiveReponse>(
    "/rbac/visibilite-membre/effective/",
  );
  return data;
}

/** GET /rbac/visibilite-membre/ — Admin App uniquement (point 9, 2026-10-05). */
export async function getVisibiliteModules(): Promise<VisibiliteModuleLigne[]> {
  const { data } = await apiClient.get<VisibiliteModuleLigne[]>("/rbac/visibilite-membre/");
  return data;
}

/** POST /rbac/visibilite-membre/set/ — une cellule (module × groupe). */
export async function setVisibiliteModule(
  payload: SetVisibilitePayload,
): Promise<VisibiliteModuleLigne> {
  const { data } = await apiClient.post<VisibiliteModuleLigne>(
    "/rbac/visibilite-membre/set/",
    payload,
  );
  return data;
}
