import { useTranslation } from "react-i18next";

import type { StatutMembre } from "../../types/membre";

const STYLES: Record<StatutMembre, string> = {
  actif: "bg-status-successBg text-status-successText",
  en_attente: "bg-status-warningBg text-status-warningText",
  inactif: "bg-status-dangerBg text-status-dangerText",
};

export default function StatutBadge({ statut }: { statut: StatutMembre }) {
  const { t } = useTranslation("membres");
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[statut]}`}
    >
      {t(`statut.${statut}`)}
    </span>
  );
}
