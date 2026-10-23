import { useTranslation } from "react-i18next";

import type { EinlassZaehler } from "../../types/einlass";

export default function Zaehler({ zaehler }: { zaehler: EinlassZaehler }) {
  const { t } = useTranslation("tickets");
  const kachel = (label: string, drin: number, gebucht: number) => (
    <div className="flex-1 rounded-cid border border-text-tertiary/20 bg-bg-secondary p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums text-text-primary">
        {drin} / {gebucht}
      </p>
      <p className="text-xs text-text-tertiary">{label}</p>
    </div>
  );
  return (
    <div className="flex gap-3" aria-label={t("einlass_zaehler")}>
      {kachel(t("einlass_erwachsene"), zaehler.drin_erwachsene, zaehler.gebucht_erwachsene)}
      {kachel(t("einlass_kinder"), zaehler.drin_kinder, zaehler.gebucht_kinder)}
    </div>
  );
}
