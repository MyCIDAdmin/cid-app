import { useTranslation } from "react-i18next";

import type { TicketStatus } from "../../types/support";

const FARBE: Record<TicketStatus, string> = {
  offen: "bg-status-warningBg text-status-warningText",
  in_bearbeitung: "bg-status-infoBg text-status-infoText",
  wartet_auf_antwort: "bg-status-infoBg text-status-infoText",
  geloest: "bg-status-successBg text-status-successText",
  geschlossen: "bg-bg-secondary text-text-tertiary",
};

export default function StatusMarke({ status }: { status: TicketStatus }) {
  const { t } = useTranslation("support");
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FARBE[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}
