import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";

import { useModuleOuvert } from "../hooks/useRbac";

type RequireMenuModuleProps = PropsWithChildren<{
  /** Clé de menu (apps.rbac.registry.MENU_ITEMS) : "fil", "forum", "vote", "albums"... */
  cle: string;
  redirectTo?: string;
}>;

/**
 * Garde de route par VISIBILITÉ DE MODULE (tableau Sichtbarkeit, Rollenverwaltung) — demande du
 * 2026-10-11 : un compte qui n'est pas membre actif ne doit atteindre QUE les modules cochés dans
 * la colonne "Nicht-Mitglied", y compris en tapant l'adresse à la main. Jusqu'ici la visibilité
 * ne faisait que masquer l'entrée de menu. Le backend refuse de toute façon l'API correspondante
 * (apps.rbac.authentication, 403 `module_non_disponible`) ; cette garde évite d'afficher une page
 * vide qui échoue au chargement et renvoie plutôt vers la Startseite.
 *
 * Rôle supérieur au "Membre Normal" : toujours autorisé (voir useModuleOuvert). Pendant le
 * chargement : indicateur plutôt que redirection, pour ne pas renvoyer à tort un membre actif.
 */
export default function RequireMenuModule({
  cle,
  redirectTo = "/",
  children,
}: RequireMenuModuleProps) {
  const { t } = useTranslation("common");
  const { ouvert, chargement } = useModuleOuvert(cle);

  if (chargement) {
    return <p className="p-6 text-sm text-text-tertiary">{t("chargement")}</p>;
  }
  if (!ouvert) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
