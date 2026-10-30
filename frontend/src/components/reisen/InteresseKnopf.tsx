/** Ein Tap : Interesse an einer Reise melden und wieder zurücknehmen. */
import { useTranslation } from "react-i18next";

import { useAbsagen, useBeitreten } from "../../hooks/useReisen";
import type { ReiseListItem } from "../../types/reisen";
import { KNOPF, KNOPF_LEISE } from "./ui";

export default function InteresseKnopf({ reise }: { reise: ReiseListItem }) {
  const { t } = useTranslation("reisen");
  const beitreten = useBeitreten(reise.id);
  const absagen = useAbsagen(reise.id);
  const laeuft = beitreten.isPending || absagen.isPending;

  if (reise.mein_status === "dabei") {
    return (
      <span className="inline-flex min-h-[36px] items-center rounded-cid bg-status-successBg px-3 text-xs font-semibold text-status-successText">
        {t("start.dabei_haken")} ✓
      </span>
    );
  }
  if (reise.mein_status === "interessiert") {
    return (
      <button
        type="button"
        aria-pressed="true"
        disabled={laeuft}
        onClick={() => absagen.mutate()}
        className={`${KNOPF_LEISE} border-ca/40 bg-ca/10 font-semibold text-ca`}
      >
        {t("start.interessiert_haken")} ✓
      </button>
    );
  }
  if (reise.mein_status || reise.abgesagt || reise.beitritt === "einladung") return null;
  return (
    <button
      type="button"
      aria-pressed="false"
      disabled={laeuft}
      onClick={() => beitreten.mutate({ status: "interessiert" })}
      className={KNOPF}
    >
      {t("start.interesse")}
    </button>
  );
}
