import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";

import { useMesAcces } from "../hooks/useRbac";
import { hasRoleAtLeast, useAuthStore } from "../store/authStore";

type RequireRoleProps = PropsWithChildren<
  {
    redirectTo?: string;
  } & (
    | { minRoleLevel: number; pageSlug?: never }
    | {
        /**
         * Phase D (ajoutée le 2026-09-23) : gate piloté par la matrice (apps.rbac,
         * `has_admin_page_access`) plutôt que par un simple seuil `ROLE_LEVELS` statique —
         * voir apps/rbac/registry.py::PAGES_ADMIN pour la liste des slugs valides. Mutuellement
         * exclusif avec `minRoleLevel` : chaque route utilise l'un OU l'autre mode, jamais les
         * deux (`/admin/roles` reste volontairement sur `minRoleLevel`, hors matrice).
         */
        pageSlug: string;
        minRoleLevel?: never;
      }
  )
>;

/**
 * Garde de route par rôle (à distinguer de RequireAuth, qui ne vérifie que
 * l'authentification). Utilisée pour les pages réservées RH+ (ex. créer/
 * modifier un membre) — la lecture reste ouverte à tout authentifié, le
 * backend scope déjà correctement ce qu'un rôle < RH peut voir.
 *
 * Mode `pageSlug` (Phase D) : consulte `useMesAcces()` au lieu de comparer `ROLE_LEVELS`
 * statiquement — l'Administrateur App reste toujours autorisé (hartcodé aussi côté client, pour
 * ne jamais le faire attendre la requête réseau sur son propre accès, déjà garanti côté
 * backend) ; pendant le chargement, affiche un indicateur plutôt que de rediriger tout de suite,
 * pour éviter un flash "accès refusé" chez un utilisateur qui a en fait accès.
 */
export default function RequireRole({
  minRoleLevel,
  pageSlug,
  redirectTo = "/membres",
  children,
}: RequireRoleProps) {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation("common");
  const estSuperAdmin = user?.role === "super_admin";
  const { data: mesAcces, isLoading: chargementAcces } = useMesAcces();

  if (pageSlug !== undefined) {
    if (estSuperAdmin) {
      return <>{children}</>;
    }
    if (chargementAcces) {
      return <p className="p-6 text-sm text-text-tertiary">{t("chargement")}</p>;
    }
    if (!mesAcces?.[pageSlug]) {
      return <Navigate to={redirectTo} replace />;
    }
    return <>{children}</>;
  }

  if (!hasRoleAtLeast(user, minRoleLevel)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
