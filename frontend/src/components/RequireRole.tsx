import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { hasRoleAtLeast, useAuthStore } from "../store/authStore";

interface RequireRoleProps extends PropsWithChildren {
  minRoleLevel: number;
  redirectTo?: string;
}

/**
 * Garde de route par rôle (à distinguer de RequireAuth, qui ne vérifie que
 * l'authentification). Utilisée pour les pages réservées RH+ (ex. créer/
 * modifier un membre) — la lecture reste ouverte à tout authentifié, le
 * backend scope déjà correctement ce qu'un rôle < RH peut voir.
 */
export default function RequireRole({
  minRoleLevel,
  redirectTo = "/membres",
  children,
}: RequireRoleProps) {
  const user = useAuthStore((s) => s.user);
  if (!hasRoleAtLeast(user, minRoleLevel)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
