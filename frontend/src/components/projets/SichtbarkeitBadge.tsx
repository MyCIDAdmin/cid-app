import { useTranslation } from "react-i18next";

import type { SichtbarkeitProjet } from "../../types/projets";

/** Brouillon/Publié (2026-10-06) — un projet publié n'a pas besoin de badge supplémentaire dans
 * les listes membres ; `afficherPublie` sert aux écrans de gestion/d'espace de travail. */
export default function SichtbarkeitBadge({
  sichtbarkeit,
  afficherPublie = false,
}: {
  sichtbarkeit: SichtbarkeitProjet;
  afficherPublie?: boolean;
}) {
  const { t } = useTranslation("projets");
  if (sichtbarkeit === "veroeffentlicht" && !afficherPublie) return null;
  const entwurf = sichtbarkeit === "entwurf";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        entwurf
          ? "bg-status-warningBg text-status-warningText"
          : "bg-status-successBg text-status-successText"
      }`}
    >
      {t(`arbeitsbereich.sichtbarkeit.${sichtbarkeit}`)}
    </span>
  );
}
