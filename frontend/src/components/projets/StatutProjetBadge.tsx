import { useTranslation } from "react-i18next";

import type { StatutProjet } from "../../types/projets";

const STYLES: Record<StatutProjet, string> = {
  en_preparation: "bg-status-infoBg text-status-infoText",
  en_cours: "bg-status-successBg text-status-successText",
  termine: "bg-bg-tertiary text-text-secondary",
  annule: "bg-status-dangerBg text-status-dangerText",
};

/** Demande utilisateur point 6 ("Es muss möglich sein Einen Status zum Projekt / Aktion
 * einzustellen") — même principe que StatutBadge (membres), dupliqué ici pour son propre type
 * StatutProjet. */
export default function StatutProjetBadge({ statut }: { statut: StatutProjet }) {
  const { t } = useTranslation("projets");
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[statut]}`}
    >
      {t(`statut.${statut}`)}
    </span>
  );
}
