/** Schmale Leiste oben im Reisechat : Reisetitel, Rest bis zur Abreise, Link zum Reiseraum. */
import { IconPlane } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useReise } from "../../hooks/useReisen";

export default function ReiseLeiste({ reise }: { reise: { id: string; titel: string } }) {
  const { t } = useTranslation("communaute");
  const detail = useReise(reise.id);
  const start = detail.data?.start;
  const tage = start ? Math.ceil((new Date(start).getTime() - Date.now()) / 86_400_000) : null;
  return (
    <div
      data-testid="reise-leiste"
      className="flex items-center gap-2 border-b border-text-tertiary/15 bg-status-warningBg px-3 py-1.5 text-xs text-status-warningText"
    >
      <IconPlane size={14} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {reise.titel}
        {tage !== null && tage > 0 && ` · ${t("chats.reise_tage", { count: tage })}`}
      </span>
      <Link to={`/reisen/${reise.id}`} className="shrink-0 font-bold underline">
        {t("chats.zum_reiseraum")}
      </Link>
    </div>
  );
}
