/**
 * Aperçu "Club Africain Live" de l'onglet "Startseite" (demande utilisateur du 2026-09-26, plan
 * "Öffentliche mycid.org-Startseite" section C.4) — pure réutilisation des composants du module
 * Fan-Club déjà construits et branchés sur GOAL API (ClassementTab/CalendrierTab, voir
 * components/communaute/), jamais reconstruits ici. Les deux composants sont déjà autonomes
 * (chacun appelle son propre hook React Query) : cet aperçu ne fait qu'ajouter la bascule
 * classement/calendrier et un habillage "carte" cohérent avec le reste de la page d'accueil.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import CalendrierTab from "../communaute/CalendrierTab";
import ClassementTab from "../communaute/ClassementTab";

type Vue = "classement" | "calendrier";

export default function FanClubPreview() {
  const { t } = useTranslation("public");
  const [vue, setVue] = useState<Vue>("classement");

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-text-primary">
          {t("fanclub.titre")}
        </h2>
        <div className="flex gap-1 rounded-full border border-text-tertiary/20 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setVue("classement")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              vue === "classement"
                ? "bg-ca text-white"
                : "text-text-secondary hover:bg-bg-tertiary"
            }`}
          >
            {t("fanclub.onglet_classement")}
          </button>
          <button
            type="button"
            onClick={() => setVue("calendrier")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              vue === "calendrier"
                ? "bg-ca text-white"
                : "text-text-secondary hover:bg-bg-tertiary"
            }`}
          >
            {t("fanclub.onglet_calendrier")}
          </button>
        </div>
      </div>

      {vue === "classement" ? <ClassementTab /> : <CalendrierTab />}
    </div>
  );
}
