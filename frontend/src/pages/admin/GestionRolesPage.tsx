/**
 * Gestion des rôles (SCD §4.2 : `GET /admin/rôles/`, réservée Admin App — route gated par
 * RequireRole au même niveau que UsersListView/ChangeUserRoleView côté backend). Depuis la
 * Phase C du module apps.rbac (2026-09-23, demande utilisateur : "das ganze zum Modul
 * Rollenverwaltung im Frontend bauen"), page à deux onglets, même structure que
 * AdminBoutiquePage.tsx :
 *   - Zuweisung (components/rbac/AttributionRolesTab.tsx) — attribution multi-rôle par
 *     utilisateur, remplace l'ancien sélecteur mono-rôle.
 *   - Zugriff (components/rbac/MatriceAccesTab.tsx) — matrice Rôle × Module et gestion des
 *     rôles personnalisés (création/suppression).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import AttributionRolesTab from "../../components/rbac/AttributionRolesTab";
import MatriceAccesTab from "../../components/rbac/MatriceAccesTab";

type Onglet = "attribution" | "acces";

export default function GestionRolesPage() {
  const { t } = useTranslation("rbac");
  const [onglet, setOnglet] = useState<Onglet>("attribution");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-text-tertiary/20">
        <button
          type="button"
          onClick={() => setOnglet("attribution")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "attribution"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("onglets.attribution")}
        </button>
        <button
          type="button"
          onClick={() => setOnglet("acces")}
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "acces"
              ? "border-b-2 border-ca text-ca"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("onglets.acces")}
        </button>
      </div>

      {onglet === "attribution" && <AttributionRolesTab />}
      {onglet === "acces" && <MatriceAccesTab />}
    </div>
  );
}
