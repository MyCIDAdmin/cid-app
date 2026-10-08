/**
 * Import Excel des membres (mockup #pg-admin-import, RICEFW W-008/F-019).
 * Route gated RH+ par RequireRole (même niveau que les endpoints d'import côté backend).
 *
 * Deux imports, chacun avec le même assistant en trois étapes (ImportAssistent, 2026-10-08) :
 * Prüfen (liste de contrôle, rien n'est écrit) -> Bestätigen (import, écrasement des doublons
 * choisis un par un) -> rapport Excel (colonnes Status/Grund).
 *  - Mitglieder : fiches membres (apps.membres.imports)
 *  - Statushistorie : statut associatif par année de membres existants, sans notification ni
 *    email (apps.membres.imports_historique)
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ImportAssistent from "./ImportAssistent";

export default function MembreImportPage() {
  const { t } = useTranslation("membres");

  return (
    <div>
      <Link to="/membres" className="mb-4 inline-block text-sm text-text-secondary hover:underline">
        ← {t("fiche.retour")}
      </Link>

      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("import.titre")}</h1>
      <ImportAssistent art="membres" />

      <h1 className="mb-4 mt-8 text-xl font-bold text-text-primary">
        {t("import_historique.titre")}
      </h1>
      <p className="mb-4 -mt-2 text-sm text-text-secondary">{t("import_historique.description")}</p>
      <ImportAssistent art="historique" />
    </div>
  );
}
