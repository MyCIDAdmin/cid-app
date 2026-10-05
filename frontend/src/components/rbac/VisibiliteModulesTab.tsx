/**
 * Onglet "Sichtbarkeit" de la Rollenverwaltung (demande utilisateur du 2026-10-05, point 9) —
 * même données que l'admin Django "Visibilité de module (Membre Normal)" : 2 colonnes éditables,
 * "Mitglied" (fiche Membre active) et "Nicht-Mitglied" (compte connecté sans adhésion active).
 * Ne concerne que le rôle système "Membre Normal" : un rôle supérieur voit toujours tout.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSetVisibiliteModule, useVisibiliteModules } from "../../hooks/useRbac";
import type { GroupeVisibilite, VisibiliteModuleLigne } from "../../types/rbac";
import { extractApiErrorMessage } from "../../utils/apiError";

const COLONNES: { groupe: GroupeVisibilite; champ: keyof VisibiliteModuleLigne }[] = [
  { groupe: "membre", champ: "visible" },
  { groupe: "non_membre", champ: "visible_non_membre" },
];

export default function VisibiliteModulesTab() {
  const { t } = useTranslation("rbac");
  const lignesQuery = useVisibiliteModules();
  const setCellule = useSetVisibiliteModule();
  const [erreur, setErreur] = useState("");

  if (lignesQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("visibilite.chargement")}</p>;
  }
  if (lignesQuery.isError) {
    return <p className="text-sm text-status-dangerText">{t("visibilite.erreur")}</p>;
  }

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <p className="mb-3 text-xs text-text-tertiary">{t("visibilite.aide")}</p>
      <table className="w-full max-w-xl text-sm">
        <thead>
          <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
            <th className="px-3 py-2">{t("visibilite.module")}</th>
            <th className="px-3 py-2 text-center">{t("visibilite.membre")}</th>
            <th className="px-3 py-2 text-center">{t("visibilite.non_membre")}</th>
          </tr>
        </thead>
        <tbody>
          {(lignesQuery.data ?? []).map((ligne) => (
            <tr key={ligne.module} className="border-b border-text-tertiary/10 last:border-0">
              <td className="px-3 py-2">{t(`modules.${ligne.module}`, ligne.module)}</td>
              {COLONNES.map(({ groupe, champ }) => (
                <td key={groupe} className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${ligne.module} ${t(`visibilite.${groupe}`)}`}
                    checked={Boolean(ligne[champ])}
                    disabled={setCellule.isPending}
                    onChange={(e) => {
                      setErreur("");
                      setCellule.mutate(
                        { module: ligne.module, visible: e.target.checked, groupe },
                        {
                          onError: (err) =>
                            setErreur(extractApiErrorMessage(err, t("visibilite.erreur"))),
                        },
                      );
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {erreur && <p className="mt-2 text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}
